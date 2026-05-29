// Sound notification utility - Simple & Natural Edition
class NotificationSound {
  constructor() {
    this.audioContext = null;
    this.isEnabled = true;
    this.isInitialized = false;
  }

  // Initialize audio context
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.isInitialized = true;
      console.log('🔊 Sound system initialized');
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
    }
  }

  // Play a simple notification sound (15 seconds max, but usually shorter)
  play(type = 'info') {
    if (!this.isEnabled || !this.isInitialized || !this.audioContext) {
      console.warn('Sound system not ready');
      return;
    }

    try {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          this.playSimpleSound(type);
        });
      } else {
        this.playSimpleSound(type);
      }
    } catch (error) {
      console.warn('Error playing sound:', error);
    }
  }

  playSimpleSound(type) {
    const now = this.audioContext.currentTime;
    
    switch(type) {
      case 'success':
        this.playSuccessSound(now);
        break;
      case 'error':
        this.playErrorSound(now);
        break;
      case 'warning':
        this.playWarningSound(now);
        break;
      case 'info':
      default:
        this.playInfoSound(now);
        break;
    }
  }

  // Info sound - Single soft "pop" (like Gmail notification)
  playInfoSound(startTime) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 784.00; // G5 - pleasant ping
    
    // Quick attack, quick decay (like a notification)
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.3);
  }

  // Success sound - Two gentle ascending notes (like task complete)
  playSuccessSound(startTime) {
    // First note
    const osc1 = this.audioContext.createOscillator();
    const gain1 = this.audioContext.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.value = 659.25; // E5
    
    gain1.gain.setValueAtTime(0, startTime);
    gain1.gain.linearRampToValueAtTime(0.1, startTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
    
    osc1.connect(gain1);
    gain1.connect(this.audioContext.destination);
    
    // Second note (higher)
    const osc2 = this.audioContext.createOscillator();
    const gain2 = this.audioContext.createGain();
    
    osc2.type = 'sine';
    osc2.frequency.value = 880.00; // A5
    
    gain2.gain.setValueAtTime(0, startTime + 0.15);
    gain2.gain.linearRampToValueAtTime(0.1, startTime + 0.17);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
    
    osc2.connect(gain2);
    gain2.connect(this.audioContext.destination);
    
    osc1.start(startTime);
    osc2.start(startTime + 0.15);
    osc1.stop(startTime + 0.2);
    osc2.stop(startTime + 0.35);
  }

  // Warning sound - Two quick beeps (like reminder)
  playWarningSound(startTime) {
    // First beep
    const osc1 = this.audioContext.createOscillator();
    const gain1 = this.audioContext.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.value = 523.25; // C5
    
    gain1.gain.setValueAtTime(0, startTime);
    gain1.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);
    
    osc1.connect(gain1);
    gain1.connect(this.audioContext.destination);
    
    // Second beep
    const osc2 = this.audioContext.createOscillator();
    const gain2 = this.audioContext.createGain();
    
    osc2.type = 'sine';
    osc2.frequency.value = 523.25; // C5
    
    gain2.gain.setValueAtTime(0, startTime + 0.2);
    gain2.gain.linearRampToValueAtTime(0.12, startTime + 0.22);
    gain2.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);
    
    osc2.connect(gain2);
    gain2.connect(this.audioContext.destination);
    
    osc1.start(startTime);
    osc2.start(startTime + 0.2);
    osc1.stop(startTime + 0.15);
    osc2.stop(startTime + 0.35);
  }

  // Error sound - Single descending note (like soft "error")
  playErrorSound(startTime) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, startTime); // A4
    osc.frequency.linearRampToValueAtTime(349.23, startTime + 0.2); // F4
    
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  }

  // Toggle sound on/off
  toggle() {
    this.isEnabled = !this.isEnabled;
    console.log(`🔊 Sound ${this.isEnabled ? 'enabled' : 'disabled'}`);
    
    if (this.isEnabled && this.isInitialized) {
      // Play a quick test sound
      this.play('info');
    }
    
    return this.isEnabled;
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }
}

// Create singleton instance
const notificationSound = new NotificationSound();

// Initialize on first user interaction
if (typeof window !== 'undefined') {
  const initOnInteraction = () => {
    notificationSound.initialize();
    document.removeEventListener('click', initOnInteraction);
    document.removeEventListener('keydown', initOnInteraction);
    document.removeEventListener('touchstart', initOnInteraction);
  };

  document.addEventListener('click', initOnInteraction);
  document.addEventListener('keydown', initOnInteraction);
  document.addEventListener('touchstart', initOnInteraction);
  
  // Also try to initialize after a short delay
  setTimeout(() => {
    if (!notificationSound.isInitialized) {
      notificationSound.initialize();
    }
  }, 1000);
}

export default notificationSound;