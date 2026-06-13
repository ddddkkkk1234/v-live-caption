import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;
env.useBrowserCache = true;

let whisperInstance = null;
let whisperModelId = "";

const loadWhisperPipeline = async (modelId) => {
    return pipeline('automatic-speech-recognition', modelId, {
        device: 'webgpu',
        progress_callback: (progress) => {
            self.postMessage({ type: 'progress', progress });
        }
    }).catch(() => pipeline('automatic-speech-recognition', modelId, {
        progress_callback: (progress) => {
            self.postMessage({ type: 'progress', progress });
        }
    }));
};

self.onmessage = async (event) => {
    const { id, type, audio, modelId, fallbackModelId, lang } = event.data || {};
    if (type !== 'transcribe') return;

    try {
        if (!whisperInstance || whisperModelId !== modelId) {
            try {
                whisperInstance = await loadWhisperPipeline(modelId);
                whisperModelId = modelId;
            } catch (primaryError) {
                self.postMessage({
                    type: 'log',
                    message: '빠른 모델 로드에 실패해 대체 모델로 전환합니다.'
                });
                whisperInstance = await loadWhisperPipeline(fallbackModelId);
                whisperModelId = fallbackModelId;
            }
        }

        const audioFloat32 = new Float32Array(audio);
        const result = await whisperInstance(audioFloat32, {
            language: lang === 'auto' ? null : lang,
            task: 'transcribe',
            return_timestamps: false,
            chunk_length_s: 30,
            stride_length_s: 5
        });

        self.postMessage({
            id,
            type: 'result',
            text: result?.text || '',
            modelId: whisperModelId
        });
    } catch (error) {
        self.postMessage({
            id,
            type: 'error',
            message: error?.message || '로컬 자막 처리 실패'
        });
    }
};
