const progressStore = new Map();

class ProgressTracker {
  constructor() {
    this.phases = {
      UPLOADING: 'uploading',
      ANALYZING: 'analyzing',
      GENERATING_RESPONSE: 'generating_response',
      COMPLETED: 'completed',
      ERROR: 'error',
    };
  }

  initProgress(trackingId) {
    progressStore.set(trackingId, {
      phase: this.phases.UPLOADING,
      progress: 0,
      message: 'Uploading PDF...',
      error: null,
    });
  }

  updateProgress(trackingId, data) {
    const currentProgress = progressStore.get(trackingId) || {};
    progressStore.set(trackingId, { ...currentProgress, ...data });
  }

  getProgress(trackingId) {
    return progressStore.get(trackingId) || null;
  }

  clearProgress(trackingId) {
    progressStore.delete(trackingId);
  }
}

module.exports = new ProgressTracker();
