#[derive(Clone, Default)]
pub struct LocalOpenAiAdapter;

#[cfg(feature = "local")]
mod batch {
    use std::path::Path;

    use owhisper_interface::ListenParams;
    use reqwest::multipart::{Form, Part};

    use super::LocalOpenAiAdapter;
    use crate::adapter::{
        BatchFuture, BatchSttAdapter, ClientWithMiddleware, append_path_if_missing,
        openai_compatible_batch::parse_response, wav::encode_mono_wav,
    };
    use crate::error::Error;

    impl BatchSttAdapter for LocalOpenAiAdapter {
        fn provider_name(&self) -> &'static str {
            "local_openai"
        }

        fn is_supported_languages(
            &self,
            _languages: &[anlg_language::Language],
            _model: Option<&str>,
        ) -> bool {
            true
        }

        fn transcribe_file<'a, P: AsRef<Path> + Send + 'a>(
            &'a self,
            _client: &'a ClientWithMiddleware,
            base: &'a str,
            key: &'a str,
            params: &'a ListenParams,
            path: P,
        ) -> BatchFuture<'a> {
            let path = path.as_ref().to_path_buf();
            Box::pin(async move {
                let mut url = url::Url::parse(base).map_err(|_| {
                    Error::provider_configuration("local_openai", "Enter an ASR server URL.")
                })?;
                if !matches!(url.scheme(), "http" | "https")
                    || !url.username().is_empty()
                    || url.password().is_some()
                {
                    return Err(Error::provider_configuration(
                        "local_openai",
                        "ASR requires an HTTP or HTTPS endpoint without embedded credentials.",
                    ));
                }
                let model = params
                    .model
                    .as_deref()
                    .filter(|model| {
                        !model.is_empty()
                            && !crate::providers::is_meta_model(model)
                            && !model.contains(":cloud")
                    })
                    .ok_or_else(|| {
                        Error::provider_configuration(
                            "local_openai",
                            "Choose an explicit local speech model.",
                        )
                    })?;
                url.set_query(None);
                append_path_if_missing(&mut url, "audio/transcriptions");

                let wav = tokio::task::spawn_blocking(move || encode_mono_wav(&path))
                    .await
                    .map_err(|error| Error::AudioProcessing(error.to_string()))??;
                let audio = hound::WavReader::new(std::io::Cursor::new(&wav))
                    .map_err(|error| Error::AudioProcessing(error.to_string()))?;
                let duration = f64::from(audio.duration()) / f64::from(audio.spec().sample_rate);
                let mut form = Form::new()
                    .text("model", model.to_string())
                    .text("response_format", "verbose_json")
                    .text("timestamp_granularities[]", "word")
                    .part(
                        "file",
                        Part::bytes(wav)
                            .file_name("audio.wav")
                            .mime_str("audio/wav")?,
                    );
                if let Some(language) = params.languages.first() {
                    form = form.text("language", language.iso639().code().to_string());
                }
                if !params.keywords.is_empty() {
                    form = form.text("prompt", params.keywords.join(", "));
                }

                let mut client =
                    reqwest::Client::builder().redirect(reqwest::redirect::Policy::none());
                if matches!(
                    url.host_str(),
                    Some("localhost" | "127.0.0.1" | "::1" | "[::1]")
                ) {
                    client = client.no_proxy();
                }
                let client = client.build()?;
                let mut request = client.post(url).multipart(form);
                if !key.is_empty() {
                    request = request.bearer_auth(key);
                }
                let mut response = parse_response("local_openai", request.send().await?).await?;
                response.metadata["model"] = serde_json::json!(model);
                if response.results.channels.iter().all(|channel| {
                    channel
                        .alternatives
                        .iter()
                        .all(|alternative| alternative.words.is_empty())
                }) {
                    response.metadata["timing_source"] = serde_json::json!("audio_chunk");
                    for channel in &mut response.results.channels {
                        for alternative in &mut channel.alternatives {
                            alternative.confidence = 0.0;
                            if !alternative.transcript.trim().is_empty() {
                                // Text-only servers provide no alignment. Keep one chunk span
                                // so the transcript persists without inventing word timings.
                                alternative.words.push(owhisper_interface::batch::Word {
                                    word: alternative.transcript.clone(),
                                    punctuated_word: Some(alternative.transcript.clone()),
                                    start: 0.0,
                                    end: duration,
                                    confidence: 0.0,
                                    channel: 0,
                                    speaker: None,
                                });
                            }
                        }
                    }
                }
                Ok(response)
            })
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        #[tokio::test]
        async fn custom_asr_accepts_a_server_hostname_and_preserves_auth_model_and_word_timing() {
            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .and(path("/v1/audio/transcriptions"))
                .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "text": "Local speech.",
                    "words": [{"word":"Local", "start":0.2, "end":0.6}]
                })))
                .mount(&server)
                .await;
            let result = LocalOpenAiAdapter
                .transcribe_file(
                    &crate::http_client::create_client(),
                    &format!(
                        "{}/v1?provider=local_openai",
                        server.uri().replace("127.0.0.1", "localhost.")
                    ),
                    "corporate-key",
                    &ListenParams {
                        model: Some("gemma4:e2b-mlx".into()),
                        ..Default::default()
                    },
                    anlg_data::english_1::AUDIO_PATH,
                )
                .await
                .unwrap();
            let requests = server.received_requests().await.unwrap();
            let body = &requests[0].body;
            assert_eq!(
                requests[0].headers.get("authorization").unwrap(),
                "Bearer corporate-key"
            );
            assert!(body.windows(4).any(|window| window == b"RIFF"));
            assert!(body.windows(4).any(|window| window == b"WAVE"));
            assert!(String::from_utf8_lossy(body).contains("gemma4:e2b-mlx"));
            assert!(requests[0].url.query().is_none());
            let alternative = &result.results.channels[0].alternatives[0];
            assert_eq!(alternative.transcript, "Local speech.");
            assert_eq!(alternative.words[0].start, 0.2);
        }

        #[tokio::test]
        async fn text_only_servers_keep_one_audio_span_without_fabricating_word_alignment() {
            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .and(path("/v1/audio/transcriptions"))
                .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "text": "Local speech without word alignment."
                })))
                .mount(&server)
                .await;
            let response = LocalOpenAiAdapter
                .transcribe_file(
                    &crate::http_client::create_client(),
                    &format!("{}/v1", server.uri()),
                    "",
                    &ListenParams {
                        model: Some("local-asr".into()),
                        ..Default::default()
                    },
                    anlg_data::english_1::AUDIO_PATH,
                )
                .await
                .unwrap();
            let alternative = &response.results.channels[0].alternatives[0];
            assert_eq!(response.metadata["timing_source"], "audio_chunk");
            assert_eq!(alternative.words.len(), 1);
            assert_eq!(alternative.words[0].word, alternative.transcript);
            assert_eq!(alternative.words[0].start, 0.0);
            assert!(alternative.words[0].end > 170.0);
            assert_eq!(alternative.words[0].confidence, 0.0);
        }

        #[tokio::test]
        async fn custom_asr_rejects_embedded_credentials_and_does_not_follow_redirects() {
            let params = ListenParams {
                model: Some("local-asr".into()),
                ..Default::default()
            };
            let client = crate::http_client::create_client();
            let remote = LocalOpenAiAdapter
                .transcribe_file(
                    &client,
                    "https://user:password@example.invalid/v1",
                    "",
                    &params,
                    anlg_data::english_1::AUDIO_PATH,
                )
                .await;
            assert!(matches!(remote, Err(Error::ProviderConfiguration { .. })));

            let server = MockServer::start().await;
            Mock::given(method("POST"))
                .and(path("/v1/audio/transcriptions"))
                .respond_with(
                    ResponseTemplate::new(307)
                        .insert_header("Location", format!("{}/unexpected", server.uri())),
                )
                .mount(&server)
                .await;
            let response = LocalOpenAiAdapter
                .transcribe_file(
                    &client,
                    &format!("{}/v1", server.uri()),
                    "",
                    &params,
                    anlg_data::english_1::AUDIO_PATH,
                )
                .await;
            assert!(
                matches!(response, Err(Error::UnexpectedStatus { status, .. }) if status.as_u16() == 307)
            );
            assert_eq!(server.received_requests().await.unwrap().len(), 1);
        }
    }
}
