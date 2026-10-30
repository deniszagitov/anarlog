#[cfg(test)]
use std::io::Cursor;
use std::path::{Path, PathBuf};

use owhisper_interface::ListenParams;
use owhisper_interface::batch::{Alternatives, Channel, Response as BatchResponse, Results, Word};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

use super::{DEFAULT_API_BASE, MODEL, MetaAdapter, SessionConfig, language};
use crate::adapter::wav::encode_mono_wav;
use crate::adapter::{
    BatchFuture, BatchSttAdapter, ClientWithMiddleware, MIXED_CAPTURE_CHANNEL,
    append_path_if_missing,
};
use crate::error::Error;

// https://dev.meta.ai/docs/api-reference/voice/transcribe
impl BatchSttAdapter for MetaAdapter {
    fn provider_name(&self) -> &'static str {
        "meta"
    }

    fn is_supported_languages(
        &self,
        languages: &[anlg_language::Language],
        _model: Option<&str>,
    ) -> bool {
        language::all_supported(languages)
    }

    fn transcribe_file<'a, P: AsRef<Path> + Send + 'a>(
        &'a self,
        client: &'a ClientWithMiddleware,
        api_base: &'a str,
        api_key: &'a str,
        params: &'a ListenParams,
        file_path: P,
    ) -> BatchFuture<'a> {
        let path = file_path.as_ref().to_path_buf();
        Box::pin(do_transcribe_file(client, api_base, api_key, params, path))
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetaTurn {
    start_ms: u64,
    end_ms: u64,
    transcript: String,
    #[serde(default)]
    speaker: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MetaBatchResponse {
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    transcript: String,
    #[serde(default)]
    turns: Vec<MetaTurn>,
}

async fn do_transcribe_file(
    client: &ClientWithMiddleware,
    api_base: &str,
    api_key: &str,
    params: &ListenParams,
    file_path: PathBuf,
) -> Result<BatchResponse, Error> {
    let wav = tokio::task::spawn_blocking(move || encode_mono_wav(&file_path))
        .await
        .map_err(|e| Error::AudioProcessing(e.to_string()))??;

    let request = SessionConfig {
        authorization: None,
        audio_encoding: "WAV",
        model: MODEL,
        mode: "DIARIZATION",
        partial_mode: None,
        emit_audio_progress: None,
        language_bias: language::language_bias(&params.languages),
        keywords: &params.keywords,
    };
    let form = Form::new()
        .part(
            "request",
            Part::text(serde_json::to_string(&request).unwrap())
                .mime_str("application/json")
                .map_err(|e| Error::AudioProcessing(e.to_string()))?,
        )
        .part(
            "audio",
            Part::bytes(wav)
                .file_name("audio.wav")
                .mime_str("audio/wav")
                .map_err(|e| Error::AudioProcessing(e.to_string()))?,
        );

    let mut url: url::Url = if api_base.is_empty() {
        DEFAULT_API_BASE
            .parse()
            .expect("invalid_default_meta_api_base")
    } else {
        api_base.parse().map_err(|e: url::ParseError| {
            Error::AudioProcessing(format!("invalid api_base: {e}"))
        })?
    };
    append_path_if_missing(&mut url, "asr/transcribe");

    let response = client
        .post(url.to_string())
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Accept", "application/json")
        .multipart(form)
        .send()
        .await?;

    let status = response.status();
    if status.is_success() {
        Ok(convert_response(response.json().await?))
    } else {
        Err(Error::UnexpectedStatus {
            status,
            body: crate::adapter::http::error_body(response).await,
        })
    }
}

fn convert_response(response: MetaBatchResponse) -> BatchResponse {
    let mut words = Vec::new();
    let mut speaker_labels: Vec<String> = Vec::new();

    for turn in &response.turns {
        let speaker = turn
            .speaker
            .as_deref()
            .filter(|label| !label.is_empty())
            .map(|label| {
                speaker_labels
                    .iter()
                    .position(|known| known == label)
                    .unwrap_or_else(|| {
                        speaker_labels.push(label.to_string());
                        speaker_labels.len() - 1
                    })
            });
        let start = turn.start_ms as f64 / 1000.0;
        let end = turn.end_ms as f64 / 1000.0;
        for (token, start, end) in MetaAdapter::word_spans(&turn.transcript, start, end) {
            let normalized = token.trim_matches(|c: char| c.is_ascii_punctuation());
            words.push(Word {
                word: if normalized.is_empty() {
                    token.to_string()
                } else {
                    normalized.to_string()
                },
                start,
                end,
                confidence: 1.0,
                channel: if speaker.is_some() {
                    MIXED_CAPTURE_CHANNEL
                } else {
                    0
                },
                speaker,
                punctuated_word: Some(token.to_string()),
            });
        }
    }

    BatchResponse {
        metadata: serde_json::json!({
            "session_id": response.session_id,
            "speaker_labels": speaker_labels,
            "timing_source": "provider_segment_interpolated",
        }),
        results: Results {
            channels: vec![Channel {
                alternatives: vec![Alternatives {
                    transcript: response.transcript.trim().to_string(),
                    confidence: 1.0,
                    words,
                }],
            }],
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapter::BatchSttAdapter;

    #[test]
    fn convert_response_indexes_speakers_and_spreads_words() {
        let response = convert_response(MetaBatchResponse {
            session_id: Some("s".to_string()),
            transcript: "Hello there. Hi.".to_string(),
            turns: vec![
                MetaTurn {
                    start_ms: 1000,
                    end_ms: 3000,
                    transcript: "Hello there.".to_string(),
                    speaker: Some("A".to_string()),
                },
                MetaTurn {
                    start_ms: 3500,
                    end_ms: 4000,
                    transcript: "Hi.".to_string(),
                    speaker: Some("B".to_string()),
                },
            ],
        });

        let words = &response.results.channels[0].alternatives[0].words;
        assert_eq!(words.len(), 3);
        assert_eq!(
            (words[0].word.as_str(), words[0].start, words[0].end),
            ("Hello", 1.0, 2.0)
        );
        assert_eq!(words[1].punctuated_word.as_deref(), Some("there."));
        assert_eq!(words[1].speaker, Some(0));
        assert_eq!(words[2].speaker, Some(1));
        assert_eq!(words[2].channel, MIXED_CAPTURE_CHANNEL);
        assert_eq!(
            response.metadata["speaker_labels"],
            serde_json::json!(["A", "B"])
        );
    }

    #[test]
    fn encode_mono_wav_downmixes_and_resamples() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stereo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for i in 0..48_000 {
            let s = ((i as f32) * 0.01).sin() * 0.5;
            writer.write_sample(s).unwrap();
            writer.write_sample(-s).unwrap();
        }
        writer.finalize().unwrap();

        let wav = encode_mono_wav(&path).unwrap();
        let reader = hound::WavReader::new(Cursor::new(wav)).unwrap();
        assert_eq!(reader.spec().channels, 1);
        assert_eq!(reader.spec().sample_rate, 16_000);
        assert_eq!(reader.spec().bits_per_sample, 16);
        assert!((reader.len() as i64 - 16_000).abs() < 100);
    }
}
