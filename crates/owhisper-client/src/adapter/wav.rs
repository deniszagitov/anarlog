use std::io::Cursor;
use std::path::Path;

use crate::error::Error;

// Muse and local ASR servers share this portable RIFF PCM input format.
pub(crate) fn encode_mono_wav(path: &Path) -> Result<Vec<u8>, Error> {
    use anlg_audio_utils::Source;

    let source = anlg_audio_utils::source_from_path(path)
        .map_err(|e| Error::AudioProcessing(e.to_string()))?;
    let channels = usize::from(u16::from(source.channels()));
    let source_rate = u32::from(source.sample_rate());
    let rate = if source_rate == 24_000 {
        24_000
    } else {
        16_000
    };
    let samples = anlg_audio_utils::resample_audio(source, rate)
        .map_err(|e| Error::AudioProcessing(e.to_string()))?;
    let mono: Vec<f32> = anlg_audio_utils::mono_frames(samples.into_iter(), channels).collect();

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)
            .map_err(|e| Error::AudioProcessing(e.to_string()))?;
        for sample in anlg_audio_utils::f32_to_i16_samples(&mono) {
            writer
                .write_sample(sample)
                .map_err(|e| Error::AudioProcessing(e.to_string()))?;
        }
        writer
            .finalize()
            .map_err(|e| Error::AudioProcessing(e.to_string()))?;
    }
    Ok(cursor.into_inner())
}
