type ZoneMood =
  | 'school'
  | 'mart'
  | 'foodcourt'
  | 'bay'
  | 'zoo'
  | 'sparkletots'
  | 'nuh'
  | 'holland'
  | 'buonavista'
  | 'botanic';

const zonePatterns: Record<ZoneMood, { bass: number; melody: number[] }> = {
  school: { bass: 261.63, melody: [523.25, 659.25, 783.99, 987.77, 880.0, 783.99, 659.25, 587.33] },
  mart: { bass: 293.66, melody: [587.33, 739.99, 880.0, 1174.66, 987.77, 880.0, 739.99, 659.25] },
  foodcourt: { bass: 246.94, melody: [493.88, 659.25, 783.99, 987.77, 880.0, 783.99, 659.25, 587.33] },
  bay: { bass: 220.0, melody: [440.0, 659.25, 880.0, 1318.51, 1174.66, 987.77, 880.0, 659.25] },
  zoo: { bass: 261.63, melody: [523.25, 698.46, 783.99, 1046.5, 1174.66, 1046.5, 783.99, 698.46] },
  sparkletots: { bass: 329.63, melody: [659.25, 783.99, 987.77, 1174.66, 987.77, 880.0, 783.99, 659.25] },
  nuh: { bass: 246.94, melody: [493.88, 587.33, 739.99, 987.77, 880.0, 739.99, 659.25, 587.33] },
  holland: { bass: 293.66, melody: [587.33, 698.46, 880.0, 1174.66, 1046.5, 880.0, 739.99, 698.46] },
  buonavista: { bass: 261.63, melody: [523.25, 659.25, 783.99, 1046.5, 987.77, 783.99, 659.25, 587.33] },
  botanic: { bass: 220.0, melody: [440.0, 587.33, 783.99, 987.77, 880.0, 783.99, 587.33, 523.25] },
};

export class AudioGuide {
  private context: AudioContext | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private muted = false;
  private mood: ZoneMood = 'school';
  private spokenLabels = new Set<string>();
  private speechQueue: SpeechSynthesisUtterance[] = [];
  private speaking = false;

  unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext();
    }

    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.speechQueue = [];
      this.speaking = false;
      window.speechSynthesis.cancel();
    }
  }

  setMood(mood: string) {
    if (mood in zonePatterns) {
      this.mood = mood as ZoneMood;
    }
  }

  pause() {
    if (this.context?.state === 'running') {
      void this.context.suspend().catch(() => undefined);
    }
  }

  resume() {
    if (this.context?.state === 'suspended' && !this.muted) {
      void this.context.resume().catch(() => undefined);
    }
  }

  startMusic() {
    if (this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.context || this.context.state !== 'running') return;
      const pattern = zonePatterns[this.mood];
      const note = pattern.melody[this.musicStep % pattern.melody.length];
      if (this.musicStep % 2 === 0) {
        this.tone(note, 0.1, 0.03, 'square');
      } else {
        this.tone(note * 0.5, 0.08, 0.018, 'triangle');
      }

      if (this.musicStep % 4 === 0) {
        this.tone(pattern.bass, 0.16, 0.025, 'sine');
      }

      if (this.musicStep % 8 === 6) {
        this.tone(note * 1.5, 0.06, 0.012, 'triangle');
      }
      this.musicStep += 1;
    }, 168);
  }

  stopMusic() {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  jump() {
    this.tone(540, 0.08, 0.08, 'sine');
    window.setTimeout(() => this.tone(760, 0.08, 0.06, 'sine'), 42);
  }

  collect() {
    [783.99, 987.77, 1174.66, 1567.98].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.11, index === 3 ? 0.1 : 0.075, 'triangle'), index * 52);
    });
    window.setTimeout(() => this.tone(1975.53, 0.08, 0.045, 'sine'), 230);
  }

  dodge() {
    [659.25, 880.0, 1318.51].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.09, 0.055, 'square'), index * 58);
    });
  }

  bump() {
    this.tone(180, 0.16, 0.08, 'sawtooth');
    window.setTimeout(() => this.tone(130, 0.14, 0.05, 'sawtooth'), 90);
  }

  smallBite() {
    [392.0, 523.25, 659.25].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.09, 0.04, 'triangle'), index * 64);
    });
  }

  rescue() {
    [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98].forEach((note, index) => {
      window.setTimeout(() => this.tone(note, 0.16, 0.1, 'triangle'), index * 95);
    });
  }

  speakTiny(id: string, text: string) {
    if (this.muted || this.spokenLabels.has(id)) return;
    this.spokenLabels.add(id);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 1.25;
    utterance.volume = 0.52;
    this.speechQueue.push(utterance);
    this.speakNext();
  }

  destroy() {
    this.stopMusic();
    this.speechQueue = [];
    this.speaking = false;
    window.speechSynthesis.cancel();
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
  }

  private speakNext() {
    if (this.muted || this.speaking) return;
    const utterance = this.speechQueue.shift();
    if (!utterance) return;

    this.speaking = true;
    const finish = () => {
      this.speaking = false;
      window.setTimeout(() => this.speakNext(), 90);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  private tone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
  ) {
    if (this.muted) return;
    this.unlock();
    if (!this.context || this.context.state === 'closed') return;

    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = type;
      gain.gain.setValueAtTime(gainValue, this.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration);
    } catch {
      this.context = null;
    }
  }
}
