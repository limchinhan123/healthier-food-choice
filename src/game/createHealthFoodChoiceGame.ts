import Phaser from 'phaser';
import { RunnerScene } from './RunnerScene';

export function createHealthFoodChoiceGame(parent: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 1600,
    height: 900,
    backgroundColor: '#88dfff',
    scale: {
      mode: Phaser.Scale.EXPAND,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      fullscreenTarget: parent,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 1180 },
        debug: false,
      },
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [RunnerScene],
  });
}
