import Phaser from 'phaser';
import { healthyFoodLevel } from '../data/healthyFoodLevel';
import { AudioGuide } from './AudioGuide';
import type { FoodDefinition, LevelDefinition, LevelZone, PlayerMode, RouteMoment, SpeedMode } from './types';

const GAME_WIDTH = 1600;
const GAME_HEIGHT = 900;
const GROUND_Y = 710;
const ITEM_GROUND_BOTTOM_Y = GROUND_Y - 34;
const ITEM_LOW_CENTER_Y = ITEM_GROUND_BOTTOM_Y - 50;
const ITEM_LOW_BODY_Y = ITEM_GROUND_BOTTOM_Y - 26;
const ITEM_JUMP_BOTTOM_Y = ITEM_GROUND_BOTTOM_Y - 174;
const PLAYER_START_X = 260;
const LOW_COLLECT_RANGE_X = 96;
const HIGH_COLLECT_RANGE_X = 104;
const OBSTACLE_HIT_RANGE_X = 44;
const OBSTACLE_DODGE_PREP_RANGE_X = 920;
const OBSTACLE_CLEAR_RANGE_X = 46;
const BACKGROUND_BLEND_OVERLAP = 96;
const JUMP_INPUT_GRACE_MS = 360;
const DODGE_FORGIVE_MS = 2300;
const ROUTE_START_X = 680;
const ROUTE_END_PADDING = 1120;
const ROUTE_MIN_SPACING = 380;
const ROUTE_MAX_SPACING = 610;
const ROUTE_MILESTONES = 6;
const RAE_PLAYER_SCALE = 0.72;
const ZOE_LEAD_SCALE = 0.72;
const ZOE_COMPANION_SCALE = 0.67;
const ZOE_COMPANION_OFFSET_X = 88;
const ZOE_COMPANION_OFFSET_Y = 82;
const SPEEDS: Record<SpeedMode, number> = {
  practice: 112,
  cozy: 136,
  adventure: 162,
};
const PLAYER_MODES = new Set<PlayerMode>(['pair', 'rae', 'cousin']);

const FAMILY_SUPPORTERS = [
  { key: 'daddy', zoneIndex: 0, scale: 0.5 },
  { key: 'mummy', zoneIndex: 1, scale: 0.5 },
  { key: 'ah-gong', zoneIndex: 2, scale: 0.5 },
  { key: 'popo', zoneIndex: 3, scale: 0.5 },
  { key: 'ah-ma', zoneIndex: 4, scale: 0.5 },
  { key: 'zoe', zoneIndex: 5, scale: 0.5 },
  { key: 'gu-zhang', zoneIndex: 6, scale: 0.5 },
  { key: 'gugu', zoneIndex: 7, scale: 0.5 },
  { key: 'aunty-white', zoneIndex: 8, scale: 0.5 },
  { key: 'aunty-navy', zoneIndex: 9, scale: 0.5 },
] as const;

type CollectibleObject = Phaser.GameObjects.Zone & {
  body: Phaser.Physics.Arcade.Body;
};

type ObstacleObject = Phaser.GameObjects.Zone & {
  body: Phaser.Physics.Arcade.Body;
};

type RunnerDebugState = {
  basket: number;
  cameraScrollX: number;
  currentZoneId: string;
  nextObstacle: {
    distance: number;
    dodgePrepared: boolean;
    foodId: string;
    x: number;
  } | null;
  obstacleStats: {
    avoided: number;
    hit: number;
    prepared: number;
  };
  playerMode: PlayerMode;
  playerScreenX: number;
  playerX: number;
  routeSeed: number;
  stars: number;
  started: boolean;
  worldLength: number;
};

type RunnerDebugWindow = Window & {
  __hfcgDebug?: RunnerDebugState;
};

export class RunnerScene extends Phaser.Scene {
  private level: LevelDefinition = healthyFoodLevel;
  private audio = new AudioGuide();
  private player!: Phaser.Physics.Arcade.Sprite;
  private companion?: Phaser.GameObjects.Sprite;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private collectibles!: Phaser.Physics.Arcade.Group;
  private obstacles!: Phaser.Physics.Arcade.Group;
  private starText!: Phaser.GameObjects.Text;
  private basketText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private spacePrompt!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;
  private recapOverlay!: Phaser.GameObjects.Container;
  private progressDots: Phaser.GameObjects.Arc[] = [];
  private routeMoments: RouteMoment[] = [];
  private currentSpeedMode: SpeedMode = 'cozy';
  private playerMode: PlayerMode = 'pair';
  private muted = false;
  private currentZoneId = 'school';
  private stars = 0;
  private basket = 0;
  private runStartedAt = 0;
  private pausedStartedAt = 0;
  private pausedDurationMs = 0;
  private routeSeed = 0;
  private started = false;
  private parentPaused = false;
  private recapActive = false;
  private finished = false;
  private lastObstacleHitAt = 0;
  private lastJumpAt = -Infinity;
  private lastCameraScrollX = 0;

  constructor() {
    super('RunnerScene');
  }

  init(data: { speedMode?: SpeedMode; playerMode?: PlayerMode } = {}) {
    if (data.speedMode && data.speedMode in SPEEDS) {
      this.currentSpeedMode = data.speedMode;
    }
    if (data.playerMode && PLAYER_MODES.has(data.playerMode)) {
      this.playerMode = data.playerMode;
    }
  }

  preload() {
    this.load.spritesheet('baby-rae', '/assets/rae/baby-rae-spritesheet.png', {
      frameWidth: 192,
      frameHeight: 208,
    });
    this.load.image('bg-school-clean', '/assets/backgrounds/zone-school-clean.png');
    this.load.image('bg-mart-clean', '/assets/backgrounds/zone-sheng-siong-clean.png');
    this.load.image('bg-foodcourt-clean', '/assets/backgrounds/zone-koufu-clean.png');
    this.load.image('bg-bay-clean', '/assets/backgrounds/zone-marina-clean.png');
    this.load.image('bg-zoo-clean', '/assets/backgrounds/zone-zoo-clean.png');
    this.load.image('bg-sparkletots', '/assets/backgrounds/zone-sparkletots.png');
    this.load.image('bg-nuh', '/assets/backgrounds/zone-nuh.png');
    this.load.image('bg-holland', '/assets/backgrounds/zone-holland-village.png');
    this.load.image('bg-buonavista', '/assets/backgrounds/zone-buona-vista.png');
    this.load.image('bg-botanic', '/assets/backgrounds/zone-botanic-gardens.png');
    FAMILY_SUPPORTERS.forEach((supporter) => {
      [0, 1, 2].forEach((frame) => {
        this.load.image(
          `supporter-${supporter.key}-wave-${frame}`,
          `/assets/npcs/supporter-${supporter.key}-wave-${frame}.png`,
        );
      });
    });
  }

  create() {
    this.resetSceneState();
    this.createRuntimeTextures();
    this.createBackground();
    this.createGround();
    this.createRouteMoments();
    this.createRescueGate();
    this.createFamilySupporters();
    this.createPlayer();
    this.createHud();
    this.createInput();
    this.createEventBridge();

    this.cameras.main.setBounds(0, 0, this.level.worldLength, GAME_HEIGHT);
    this.physics.world.setBounds(0, 0, this.level.worldLength, GAME_HEIGHT);
    this.publishDebugState();
  }

  private resetSceneState() {
    this.audio = new AudioGuide();
    this.audio.setMuted(this.muted);
    this.progressDots = [];
    this.companion = undefined;
    this.routeSeed = Date.now() + Math.floor(Math.random() * 100000);
    this.routeMoments = this.createRandomRoute();
    this.currentZoneId = this.level.zones[0]?.id ?? 'school';
    this.stars = 0;
    this.basket = 0;
    this.runStartedAt = 0;
    this.pausedStartedAt = 0;
    this.pausedDurationMs = 0;
    this.started = false;
    this.parentPaused = false;
    this.recapActive = false;
    this.finished = false;
    this.lastObstacleHitAt = 0;
    this.lastJumpAt = -Infinity;
    this.lastCameraScrollX = 0;
  }

  update() {
    this.syncCompanionToPlayer();
    if (!this.started || this.parentPaused || this.recapActive || this.finished) return;

    this.player.setVelocityX(SPEEDS[this.currentSpeedMode]);
    this.updateCamera();
    this.updateCollectibleEncounters();
    this.updateObstacleCollisions();
    this.updateObstacleAvoidance();
    this.updateZone();
    this.updateHud();
    this.publishDebugState();

    if (this.player.x >= this.level.worldLength - 820) {
      this.finishLevel();
    }
  }

  private createRuntimeTextures() {
    ['ground-tile', 'cloud'].forEach((key) => {
      if (this.textures.exists(key)) this.textures.remove(key);
    });

    const ground = this.make.graphics({ x: 0, y: 0 }, false);
    ground.fillStyle(0x68bd51, 0.9);
    ground.fillRoundedRect(0, 0, 240, 16, 8);
    ground.fillStyle(0xffffff, 0.26);
    ground.fillRoundedRect(0, 6, 240, 4, 2);
    ground.generateTexture('ground-tile', 240, 18);
    ground.destroy();

    const cloud = this.make.graphics({ x: 0, y: 0 }, false);
    cloud.fillStyle(0xffffff, 0.88);
    cloud.fillCircle(34, 40, 28);
    cloud.fillCircle(68, 32, 36);
    cloud.fillCircle(108, 42, 28);
    cloud.fillRoundedRect(22, 46, 112, 28, 14);
    cloud.generateTexture('cloud', 160, 90);
    cloud.destroy();
  }

  private createBackground() {
    const backgroundKeys: Record<string, string> = {
      school: 'bg-school-clean',
      mart: 'bg-mart-clean',
      foodcourt: 'bg-foodcourt-clean',
      bay: 'bg-bay-clean',
      zoo: 'bg-zoo-clean',
      sparkletots: 'bg-sparkletots',
      nuh: 'bg-nuh',
      holland: 'bg-holland',
      buonavista: 'bg-buonavista',
      botanic: 'bg-botanic',
    };

    this.add.rectangle(this.level.worldLength / 2, GAME_HEIGHT / 2, this.level.worldLength, GAME_HEIGHT, 0x86dfff)
      .setDepth(-60);

    this.level.zones.forEach((zone, index) => {
      const width = zone.endX - zone.startX;
      const panelKey = this.createBlendedBackgroundPanel(
        `bg-panel-${index}-${zone.id}`,
        backgroundKeys[zone.id] ?? 'bg-school-clean',
        width,
        index,
      );
      const panelWidth = width + BACKGROUND_BLEND_OVERLAP * 2;
      this.add.image(zone.startX - BACKGROUND_BLEND_OVERLAP + panelWidth / 2, GAME_HEIGHT / 2, panelKey)
        .setDisplaySize(panelWidth, GAME_HEIGHT)
        .setScrollFactor(1)
        .setDepth(-50 + index * 0.01);
    });
  }

  private createBlendedBackgroundPanel(
    key: string,
    sourceKey: string,
    zoneWidth: number,
    index: number,
  ) {
    if (this.textures.exists(key)) this.textures.remove(key);

    const textureWidth = zoneWidth + BACKGROUND_BLEND_OVERLAP * 2;
    const panel = this.textures.createCanvas(key, textureWidth, GAME_HEIGHT);
    if (!panel) return sourceKey;

    const context = panel.context;
    const source = this.textures.get(sourceKey).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const edgeSourceWidth = Math.max(1, Math.round(source.width * (BACKGROUND_BLEND_OVERLAP / zoneWidth)));

    context.clearRect(0, 0, textureWidth, GAME_HEIGHT);
    context.drawImage(source, 0, 0, edgeSourceWidth, source.height, 0, 0, BACKGROUND_BLEND_OVERLAP, GAME_HEIGHT);
    context.drawImage(source, 0, 0, source.width, source.height, BACKGROUND_BLEND_OVERLAP, 0, zoneWidth, GAME_HEIGHT);
    context.drawImage(
      source,
      source.width - edgeSourceWidth,
      0,
      edgeSourceWidth,
      source.height,
      BACKGROUND_BLEND_OVERLAP + zoneWidth,
      0,
      BACKGROUND_BLEND_OVERLAP,
      GAME_HEIGHT,
    );

    const mask = document.createElement('canvas');
    mask.width = textureWidth;
    mask.height = GAME_HEIGHT;
    const maskContext = mask.getContext('2d');
    if (maskContext) {
      const fadeWidth = BACKGROUND_BLEND_OVERLAP * 2;
      const isFirst = index === 0;
      const isLast = index === this.level.zones.length - 1;
      const solidStart = isFirst ? 0 : fadeWidth;
      const solidEnd = isLast ? textureWidth : textureWidth - fadeWidth;

      if (!isFirst) {
        const leftFade = maskContext.createLinearGradient(0, 0, fadeWidth, 0);
        leftFade.addColorStop(0, 'rgba(255, 255, 255, 0)');
        leftFade.addColorStop(1, 'rgba(255, 255, 255, 1)');
        maskContext.fillStyle = leftFade;
        maskContext.fillRect(0, 0, fadeWidth, GAME_HEIGHT);
      }

      maskContext.fillStyle = 'rgba(255, 255, 255, 1)';
      maskContext.fillRect(solidStart, 0, solidEnd - solidStart, GAME_HEIGHT);

      if (!isLast) {
        const rightFade = maskContext.createLinearGradient(textureWidth - fadeWidth, 0, textureWidth, 0);
        rightFade.addColorStop(0, 'rgba(255, 255, 255, 1)');
        rightFade.addColorStop(1, 'rgba(255, 255, 255, 0)');
        maskContext.fillStyle = rightFade;
        maskContext.fillRect(textureWidth - fadeWidth, 0, fadeWidth, GAME_HEIGHT);
      }

      context.globalCompositeOperation = 'destination-in';
      context.drawImage(mask, 0, 0);
      context.globalCompositeOperation = 'source-over';
    }

    panel.refresh();
    return key;
  }

  private createZoneIdentity(zone: LevelZone, index: number) {
    const width = zone.endX - zone.startX;
    const signX = zone.startX + 620 + (index % 2) * 240;
    this.createPlaceSign(signX, 226, zone.name, 0xffffff, 0x314154, zone.accent)
      .setAlpha(0.9)
      .setScale(zone.name.length > 20 ? 0.82 : 0.92);

    if (zone.id === 'sparkletots') {
      this.createPlayground(zone.startX + 410, GROUND_Y - 112);
      this.createPlaceSign(zone.startX + width - 520, 452, 'PCF Sparkletots', 0xffffff, 0x2873b9, 0xff9ec6);
      this.createFloatingButterflies(zone.startX + 760, zone.endX - 240, 0xf8a0bf);
    }

    if (zone.id === 'nuh') {
      this.createHospital(zone.startX + width - 510, GROUND_Y - 168);
    }

    if (zone.id === 'holland') {
      this.createAwning(zone.startX + width - 490, GROUND_Y - 152, 0xf08a55, 'Holland Village');
      this.createFloatingButterflies(zone.startX + 740, zone.endX - 260, 0xff9ec6);
    }

    if (zone.id === 'buonavista') {
      this.createMrtStation(zone.startX + width - 520, GROUND_Y - 164);
    }

    if (zone.id === 'botanic') {
      this.createGardenScene(zone.startX + width - 500, GROUND_Y - 140);
      this.createFloatingButterflies(zone.startX + 620, zone.endX - 180, 0xff9ec6);
    }
  }

  private createHospital(x: number, y: number) {
    const hospital = this.add.container(x, y).setDepth(-4);
    hospital.add(this.add.rectangle(0, -90, 440, 250, 0xf5fbff, 0.92).setStrokeStyle(4, 0xb7d6e6, 0.58));
    hospital.add(this.add.rectangle(0, -226, 460, 48, 0x5bb5d9, 0.95));
    hospital.add(this.add.text(0, -228, 'NUH', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '42px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    hospital.add(this.add.rectangle(0, -108, 92, 28, 0xe84d5c, 0.96));
    hospital.add(this.add.rectangle(0, -108, 28, 92, 0xe84d5c, 0.96));
    for (let i = 0; i < 3; i += 1) {
      hospital.add(this.add.rectangle(-138 + i * 138, -52, 66, 54, 0xbde1ee, 0.86).setStrokeStyle(2, 0x8fbfce, 0.5));
    }
  }

  private createMrtStation(x: number, y: number) {
    const station = this.add.container(x, y).setDepth(-4);
    station.add(this.add.rectangle(0, -86, 480, 210, 0xeef7f9, 0.9).setStrokeStyle(4, 0x9db9c3, 0.5));
    station.add(this.add.rectangle(0, -204, 500, 42, 0x57b879, 0.95));
    station.add(this.add.text(0, -206, 'Buona Vista MRT', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '34px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    station.add(this.add.rectangle(-72, -78, 116, 62, 0xdff4f9, 0.9).setStrokeStyle(2, 0x8eb6c4, 0.55));
    station.add(this.add.rectangle(84, -78, 116, 62, 0xdff4f9, 0.9).setStrokeStyle(2, 0x8eb6c4, 0.55));
    station.add(this.add.text(0, -26, '🚆', { fontSize: '52px' }).setOrigin(0.5));
  }

  private createGardenScene(x: number, y: number) {
    const garden = this.add.container(x, y).setDepth(-4);
    garden.add(this.add.ellipse(0, 40, 620, 126, 0x5fad63, 0.58));
    garden.add(this.add.text(-190, -34, '🌺', { fontSize: '74px' }).setOrigin(0.5));
    garden.add(this.add.text(-70, -64, '🌿', { fontSize: '82px' }).setOrigin(0.5));
    garden.add(this.add.text(78, -42, '🌸', { fontSize: '78px' }).setOrigin(0.5));
    garden.add(this.add.text(200, -76, '🌳', { fontSize: '86px' }).setOrigin(0.5));
    garden.add(this.add.text(0, -148, 'Botanic Gardens', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '36px',
      color: '#2f7044',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 6,
    }).setOrigin(0.5));
  }

  private createZoneArt(startX: number, endX: number, zoneId: string, index: number) {
    const width = endX - startX;
    const skyColors: Record<string, number> = {
      school: 0x72cfff,
      mart: 0x80d9ff,
      foodcourt: 0x86ddff,
      bay: 0x78d7ff,
      zoo: 0x86dbbf,
    };

    this.add.rectangle(startX + width / 2, 300, width + 8, 600, skyColors[zoneId] ?? 0x80d9ff)
      .setDepth(-49);
    this.add.image(startX + width / 2, 292, 'concept-sg-backdrop')
      .setDisplaySize(width + 24, 610)
      .setDepth(-48)
      .setAlpha(0.94);
    this.createZoneLandmark(startX, endX, zoneId);
    this.createAnimatedZoneAccents(startX, endX, zoneId);
  }

  private createCloudCluster(x: number, y: number, scale = 1) {
    const cloud = this.add.container(x, y).setDepth(-43).setAlpha(0.84).setScale(scale);
    cloud.add(this.add.ellipse(-58, 14, 120, 64, 0xffffff, 0.9));
    cloud.add(this.add.ellipse(24, -8, 150, 86, 0xffffff, 0.94));
    cloud.add(this.add.ellipse(112, 20, 120, 62, 0xffffff, 0.9));
    cloud.add(this.add.rectangle(26, 34, 230, 42, 0xffffff, 0.88));
  }

  private createHdbRow(startX: number, endX: number, index: number) {
    const palette = [0xf1f6f8, 0xe9f0f2, 0xf5f2ed];
    for (let i = 0; i < 5; i += 1) {
      const x = startX + 360 + i * 780;
      if (x > endX - 160) continue;
      const width = 330 + ((i + index) % 2) * 54;
      const height = 250 + ((i + index) % 3) * 52;
      const bottom = 446 + (i % 2) * 16;
      const block = this.add.rectangle(x, bottom - height / 2, width, height, palette[(i + index) % palette.length], 0.72)
        .setDepth(-40)
        .setStrokeStyle(3, 0xd6e3e8, 0.58);

      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          const isPink = (row + col + i) % 4 === 0;
          this.add.rectangle(
            block.x - width / 2 + 62 + col * 72,
            block.y - height / 2 + 56 + row * 42,
            36,
            22,
            isPink ? 0xf7c7d4 : 0xbcd9e8,
            0.82,
          )
            .setDepth(-39);
        }
      }
    }
  }

  private createMrtLine(startX: number, endX: number, index: number) {
    const width = endX - startX;
    const y = 302 + (index % 2) * 24;
    this.add.rectangle(startX + width / 2, y + 58, width + 120, 28, 0x9eb4bf, 0.86)
      .setDepth(-31);
    this.add.rectangle(startX + width / 2, y + 40, width + 120, 10, 0xd7e0e5, 0.9)
      .setDepth(-30);

    for (let x = startX + 400; x < endX; x += 900) {
      this.add.rectangle(x, y + 116, 26, 160, 0x8d9ca5, 0.72)
        .setDepth(-32);
    }

    const train = this.add.container(startX + 480, y).setDepth(-29);
    for (let i = 0; i < 5; i += 1) {
      train.add(this.add.rectangle(i * 132, 0, 126, 44, 0xf7fbff, 0.96).setStrokeStyle(2, 0xc9d8df, 0.8));
      train.add(this.add.rectangle(i * 132, 8, 96, 8, 0xe44b4f, 0.9));
      train.add(this.add.rectangle(i * 132, -8, 58, 16, 0x9edaf0, 0.86));
    }
    this.tweens.add({
      targets: train,
      x: startX + width - 1020,
      duration: 17000 + index * 900,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.inOut',
    });
  }

  private createConceptTrees(startX: number, endX: number, index: number) {
    for (let i = 0; i < 5; i += 1) {
      const x = startX + 280 + i * 890;
      if (x > endX - 100) continue;
      const trunk = this.add.rectangle(x, 526, 34, 178, 0x785333, 0.78)
        .setDepth(-22)
        .setOrigin(0.5, 1);
      const crown = this.add.container(x, 378 + ((i + index) % 2) * 28).setDepth(-21).setAlpha(0.92);
      crown.add(this.add.ellipse(-68, 28, 190, 120, 0x429d5d));
      crown.add(this.add.ellipse(20, -10, 220, 145, 0x59b668));
      crown.add(this.add.ellipse(118, 36, 180, 112, 0x3f9658));
      crown.add(this.add.ellipse(24, 56, 270, 105, 0x63bf70));
      this.tweens.add({
        targets: [trunk, crown],
        angle: i % 2 === 0 ? 0.7 : -0.7,
        duration: 2100 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  private createCoveredWalkway(startX: number, endX: number, index: number) {
    const width = endX - startX;
    const roofY = 535 + (index % 2) * 6;
    this.add.rectangle(startX + width / 2, roofY, width - 520, 22, 0x4a9a8b, 0.8)
      .setDepth(-11)
      .setStrokeStyle(2, 0x2f7b70, 0.46);
    this.add.rectangle(startX + width / 2, roofY + 16, width - 560, 10, 0x7fc5b4, 0.7)
      .setDepth(-10);
    for (let x = startX + 620; x < endX - 300; x += 420) {
      this.add.rectangle(x, roofY + 74, 16, 126, 0x6c8790, 0.45)
        .setDepth(-12);
    }
  }

  private createZoneLandmark(startX: number, endX: number, zoneId: string) {
    const width = endX - startX;
    if (zoneId === 'school') {
      this.createPlayground(startX + 450, GROUND_Y - 112);
      this.createSingaporeFlag(startX + width - 1120, 282);
    }

    if (zoneId === 'mart') {
      this.createMartStall(startX + 2120, GROUND_Y - 180);
    }

    if (zoneId === 'foodcourt') {
      this.createFoodCourtStalls(startX + 1960, GROUND_Y - 192);
    }

    if (zoneId === 'bay') {
      this.createBayScene(startX + 2050, GROUND_Y - 130);
    }

    if (zoneId === 'zoo') {
      this.createZooScene(startX + 1540, GROUND_Y - 160);
    }
  }

  private createPlayground(x: number, y: number) {
    const structure = this.add.container(x, y).setDepth(-5);
    structure.add(this.add.rectangle(-88, -82, 140, 120, 0x2784c7, 0.92).setStrokeStyle(4, 0x1e679a, 0.5));
    structure.add(this.add.rectangle(-88, -162, 164, 42, 0xf2c04b, 0.96));
    structure.add(this.add.triangle(-88, -206, -98, 38, 0, -36, 98, 38, 0xffcf5a, 0.98));
    structure.add(this.add.rectangle(-148, -8, 22, 150, 0x9b6a3f, 0.85));
    structure.add(this.add.rectangle(-30, -8, 22, 150, 0x9b6a3f, 0.85));
    structure.add(this.add.arc(80, -26, 108, 0, 90, false, 0xf29a34, 0.96).setStrokeStyle(28, 0xf29a34, 0.96));
    structure.add(this.add.rectangle(128, 8, 210, 34, 0xf29a34, 0.96).setAngle(18));
  }

  private createSingaporeFlag(x: number, y: number) {
    this.add.rectangle(x, y + 86, 10, 170, 0x8d8f92, 0.88).setDepth(-8);
    const flag = this.add.container(x + 78, y + 16).setDepth(-7);
    flag.add(this.add.rectangle(0, 0, 132, 76, 0xffffff, 0.96).setStrokeStyle(2, 0xd8d8d8, 0.6));
    flag.add(this.add.rectangle(0, -19, 132, 38, 0xe13737, 0.96));
    flag.add(this.add.text(-36, -20, '☾', { fontSize: '26px', color: '#ffffff' }).setOrigin(0.5));
    flag.add(this.add.text(-10, -20, '✦', { fontSize: '16px', color: '#ffffff' }).setOrigin(0.5));
  }

  private createMartStall(x: number, y: number) {
    const stall = this.add.container(x, y).setDepth(-4);
    stall.add(this.add.rectangle(0, -96, 620, 210, 0xffefc2, 0.92).setStrokeStyle(4, 0xd6b16b, 0.5));
    stall.add(this.add.rectangle(0, -210, 660, 38, 0x2f9757, 0.96));
    for (let i = 0; i < 7; i += 1) {
      stall.add(this.add.triangle(-288 + i * 96, -184, -48, 0, 48, 0, 0, 44, i % 2 ? 0xffffff : 0x45b866, 0.96));
    }
    stall.add(this.add.text(0, -220, 'SHENG SIONG', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '38px',
      color: '#17499a',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    ['🍎', '🥕', '🥦', '🍌'].forEach((item, i) => {
      stall.add(this.add.text(-210 + i * 140, -88, item, { fontSize: '56px' }).setOrigin(0.5));
      stall.add(this.add.rectangle(-210 + i * 140, -48, 100, 36, 0x58a569, 0.78));
    });
  }

  private createFoodCourtStalls(x: number, y: number) {
    const court = this.add.container(x, y).setDepth(-4);
    court.add(this.add.rectangle(0, -110, 740, 235, 0xfff0cf, 0.94).setStrokeStyle(4, 0xd8b179, 0.52));
    court.add(this.add.rectangle(0, -240, 760, 48, 0xf08335, 0.94));
    court.add(this.add.text(0, -242, 'KOUFU', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '46px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    for (let i = 0; i < 4; i += 1) {
      court.add(this.add.rectangle(-270 + i * 180, -128, 132, 70, 0xffffff, 0.82).setStrokeStyle(2, 0xd4bda0, 0.6));
      court.add(this.add.text(-270 + i * 180, -130, i % 2 ? '🍜' : '🍚', { fontSize: '48px' }).setOrigin(0.5));
      court.add(this.add.rectangle(-270 + i * 180, -42, 146, 78, 0xd2793d, 0.72));
    }
  }

  private createBayScene(x: number, y: number) {
    const bay = this.add.container(x, y).setDepth(-4);
    bay.add(this.add.ellipse(0, 24, 760, 96, 0x61c1d4, 0.78));
    bay.add(this.add.rectangle(-190, -82, 44, 210, 0xeaf2f5, 0.76));
    bay.add(this.add.rectangle(-110, -122, 44, 290, 0xeaf2f5, 0.76));
    bay.add(this.add.rectangle(-30, -96, 44, 236, 0xeaf2f5, 0.76));
    bay.add(this.add.arc(-110, -238, 128, 180, 360, false, 0xdfe9ee, 0.75).setStrokeStyle(14, 0xdfe9ee, 0.75));
    bay.add(this.add.text(160, -86, 'Marina Bay', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '36px',
      color: '#1e6da6',
      fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  private createZooScene(x: number, y: number) {
    const zoo = this.add.container(x, y).setDepth(-4);
    zoo.add(this.add.rectangle(0, -72, 610, 220, 0xc79252, 0.96).setStrokeStyle(5, 0x9b6d3c, 0.62));
    zoo.add(this.add.rectangle(0, 4, 480, 126, 0xf0d09a, 0.92));
    zoo.add(this.add.text(0, -164, 'Singapore Zoo', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '38px',
      color: '#5a3f24',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    zoo.add(this.add.text(-172, -48, '🦒', { fontSize: '76px' }).setOrigin(0.5));
    zoo.add(this.add.text(170, -46, '🦜', { fontSize: '66px' }).setOrigin(0.5));
  }

  private createAnimatedZoneAccents(startX: number, endX: number, zoneId: string) {
    const width = endX - startX;
    if (zoneId === 'school') {
      this.createPlaceSign(startX + width - 720, 455, 'PCF Sparkletots', 0xffffff, 0x2873b9);
      this.createFloatingButterflies(startX + 900, startX + width - 500, 0xf8a0bf);
    }

    if (zoneId === 'mart') {
      this.createPlaceSign(startX + 1780, 214, 'SHENG SIONG', 0xffffff, 0x17499a, 0xe33c36);
      for (let i = 0; i < 4; i += 1) {
        const cart = this.add.text(startX + 1100 + i * 820, GROUND_Y - 108, '🛒', {
          fontSize: '44px',
        })
          .setOrigin(0.5)
          .setDepth(4)
          .setAlpha(0.82);
        this.tweens.add({
          targets: cart,
          x: cart.x + 70,
          duration: 2400 + i * 260,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    }

    if (zoneId === 'foodcourt') {
      this.createPlaceSign(startX + 2000, 238, 'KOUFU', 0xffffff, 0xe85d23, 0xf39a21);

      for (let i = 0; i < 5; i += 1) {
        const steam = this.add.text(startX + 780 + i * 700, GROUND_Y - 230, '⌇', {
          fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
          fontSize: '56px',
          color: '#ffffff',
        })
          .setOrigin(0.5)
          .setDepth(4)
          .setAlpha(0.52);
        this.tweens.add({
          targets: steam,
          y: steam.y - 34,
          alpha: 0.12,
          duration: 1300,
          delay: i * 150,
          repeat: -1,
          ease: 'Sine.out',
        });
      }
    }

    if (zoneId === 'bay') {
      this.createPlaceSign(startX + 900, 250, 'Marina Bay', 0xffffff, 0x1e6da6, 0x72c9df);
      for (let i = 0; i < 4; i += 1) {
        const sparkle = this.add.text(startX + 680 + i * 900, GROUND_Y - 260, '✧', {
          fontSize: '34px',
          color: '#ffffff',
        })
          .setOrigin(0.5)
          .setDepth(4)
          .setAlpha(0.62);
        this.tweens.add({
          targets: sparkle,
          alpha: 0.16,
          scale: 1.35,
          duration: 880 + i * 110,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    }

    if (zoneId === 'zoo') {
      this.createPlaceSign(startX + 900, 235, 'Singapore Zoo', 0xf7ead1, 0x5a3f24, 0x76a858);
      ['🦋', '🦜', '🦋'].forEach((animal, i) => {
        const flyer = this.add.text(startX + 780 + i * 880, 210 + i * 48, animal, {
          fontSize: '40px',
        })
          .setOrigin(0.5)
          .setDepth(4);
        this.tweens.add({
          targets: flyer,
          x: flyer.x + 160,
          y: flyer.y - 28,
          duration: 4200 + i * 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      });
    }
  }

  private createPlaceSign(
    x: number,
    y: number,
    label: string,
    fill: number,
    textColor: number,
    accent: number = 0xffa3c4,
  ) {
    const sign = this.add.container(x, y).setDepth(5);
    const board = this.add.graphics();
    const width = Math.max(260, label.length * 24);
    board.fillStyle(fill, 0.88);
    board.fillRoundedRect(-width / 2, -42, width, 84, 10);
    board.lineStyle(4, accent, 0.78);
    board.strokeRoundedRect(-width / 2, -42, width, 84, 10);
    sign.add(board);
    sign.add(this.add.text(0, -2, label, {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: label.length > 13 ? '34px' : '42px',
      color: `#${textColor.toString(16).padStart(6, '0')}`,
      fontStyle: 'bold',
    }).setOrigin(0.5));
    return sign;
  }

  private createFloatingButterflies(startX: number, endX: number, color: number) {
    for (let i = 0; i < 6; i += 1) {
      const butterfly = this.add.text(startX + i * ((endX - startX) / 6), 370 + (i % 3) * 54, '♡', {
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '30px',
        color: `#${color.toString(16)}`,
      })
        .setOrigin(0.5)
        .setDepth(4)
        .setAlpha(0.58);
      this.tweens.add({
        targets: butterfly,
        x: butterfly.x + 55,
        y: butterfly.y - 18,
        duration: 1800 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  private createZoneBackdrop(
    startX: number,
    endX: number,
    name: string,
    accent: number,
    index: number,
  ) {
    const width = endX - startX;
    const midX = startX + width / 2;

    for (let i = 0; i < 5; i += 1) {
      const buildingX = startX + 320 + i * 720;
      const buildingHeight = 250 + ((i + index) % 3) * 72;
      const building = this.add.rectangle(
        buildingX,
        360 - buildingHeight / 2,
        320,
        buildingHeight,
        0xe9f0f2,
      )
        .setDepth(-35)
        .setScrollFactor(0.7)
        .setStrokeStyle(3, 0xcdd9df, 0.6);

      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 4; col += 1) {
          this.add.rectangle(
            building.x - 108 + col * 70,
            building.y - buildingHeight / 2 + 42 + row * 45,
            34,
            22,
            row % 2 === 0 ? 0xbdd6e8 : 0xf3c4c9,
          )
            .setDepth(-34)
            .setScrollFactor(0.7)
            .setAlpha(0.82);
        }
      }
    }

    const mrtY = 238 + (index % 2) * 26;
    this.add.rectangle(midX, mrtY + 50, width + 300, 28, 0x93aab8)
      .setDepth(-29)
      .setScrollFactor(0.82);
    for (let i = 0; i < 4; i += 1) {
      this.add.rectangle(startX + 700 + i * 980, mrtY + 94, 26, 150, 0x8b98a3)
        .setDepth(-30)
        .setScrollFactor(0.82);
    }

    const train = this.add.container(startX + 420, mrtY);
    train.setDepth(-28).setScrollFactor(0.82);
    for (let i = 0; i < 5; i += 1) {
      train.add(this.add.rectangle(i * 132, 0, 126, 42, 0xf1f6f8).setStrokeStyle(2, 0xc7d5dc));
      train.add(this.add.rectangle(i * 132, 6, 86, 8, 0xe85055));
      train.add(this.add.rectangle(i * 132, -8, 58, 14, 0x9fd4eb));
    }
    this.tweens.add({
      targets: train,
      x: startX + width - 900,
      duration: 16000,
      repeat: -1,
      yoyo: true,
      ease: 'Sine.inOut',
    });

    this.createZoneForeground(startX, endX, name, accent, index);
  }

  private createZoneForeground(
    startX: number,
    endX: number,
    name: string,
    accent: number,
    index: number,
  ) {
    const sign = this.add.container(startX + 720, 520).setDepth(-5);
    const board = this.add.graphics();
    board.fillStyle(0xffffff, 0.84);
    board.fillRoundedRect(-136, -52, 272, 92, 12);
    board.lineStyle(4, accent, 0.7);
    board.strokeRoundedRect(-136, -52, 272, 92, 12);
    sign.add(board);
    sign.add(
      this.add.text(0, -14, name, {
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '30px',
        color: '#314154',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    for (let i = 0; i < 4; i += 1) {
      const x = startX + 450 + i * 920;
      const trunk = this.add.rectangle(x, GROUND_Y - 128, 24, 150, 0x8c5b35)
        .setDepth(-4)
        .setOrigin(0.5, 1);
      const crown = this.add.ellipse(x, GROUND_Y - 198, 190, 128, 0x3d9c62)
        .setDepth(-3);
      this.tweens.add({
        targets: [trunk, crown],
        angle: i % 2 === 0 ? 1.2 : -1.2,
        duration: 1800 + i * 170,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }

    if (index === 1) {
      this.createAwning(startX + 1850, GROUND_Y - 150, 0x48b46a, 'Fresh Mart');
    } else if (index === 2) {
      this.createAwning(startX + 1820, GROUND_Y - 150, 0xf0ad42, 'Food Court');
    } else if (index === 3) {
      this.add.ellipse(startX + 2060, GROUND_Y - 60, 680, 90, 0x70c9dc)
        .setDepth(-8)
        .setAlpha(0.8);
      this.add.rectangle(startX + 2060, GROUND_Y - 172, 560, 18, 0xdadfe3)
        .setDepth(-5);
    } else if (index === 4) {
      ['🦒', '🐘', '🦜'].forEach((animal, animalIndex) => {
        const label = this.add.text(startX + 1450 + animalIndex * 330, GROUND_Y - 180, animal, {
          fontSize: '68px',
        })
          .setOrigin(0.5)
          .setDepth(-4);
        this.tweens.add({
          targets: label,
          y: label.y - 18,
          duration: 1050 + animalIndex * 180,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      });
    }
  }

  private createAwning(x: number, y: number, color: number, label: string) {
    this.add.rectangle(x, y, 560, 190, 0xfff2d0)
      .setDepth(-7)
      .setStrokeStyle(4, 0xd6ba7a, 0.5);
    for (let i = 0; i < 7; i += 1) {
      this.add.triangle(
        x - 240 + i * 80,
        y - 108,
        -40,
        0,
        40,
        0,
        0,
        44,
        i % 2 === 0 ? color : 0xffffff,
      ).setDepth(-5);
    }
    this.add.text(x, y - 26, label, {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '32px',
      color: '#384757',
      fontStyle: 'bold',
    })
      .setOrigin(0.5)
      .setDepth(-4);
  }

  private createGround() {
    const ground = this.add.rectangle(
      this.level.worldLength / 2,
      GROUND_Y + 42,
      this.level.worldLength,
      112,
      0x000000,
      0,
    )
      .setDepth(-1);
    this.physics.add.existing(ground, true);

    const body = ground.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(this.level.worldLength, 112);
  }

  private createRouteMoments() {
    this.collectibles = this.physics.add.group();
    this.obstacles = this.physics.add.group();

    this.routeMoments.forEach((moment) => {
      const x = moment.x;
      if (moment.kind === 'rest') {
        this.add.text(x, GROUND_Y - 78, '♡', {
          fontSize: '34px',
          color: '#ff8db6',
          fontFamily: 'Arial, sans-serif',
        })
          .setOrigin(0.5)
          .setDepth(5)
          .setAlpha(0.38);
        return;
      }

      if (moment.kind === 'runCollect' && moment.foodId) {
        this.createCollectible(x, 'low', this.level.foods[moment.foodId]);
      }

      if (moment.kind === 'jumpCollect' && moment.foodId) {
        this.createCollectible(x, 'high', this.level.foods[moment.foodId]);
      }

      if (moment.kind === 'avoid' && moment.obstacleId) {
        this.createObstacle(x, this.level.foods[moment.obstacleId]);
      }

      if (moment.kind === 'combo') {
        if (moment.obstacleId) {
          this.createObstacle(x, this.level.foods[moment.obstacleId]);
        }
        if (moment.foodId) {
          this.createCollectible(x + 110, 'high', this.level.foods[moment.foodId]);
        }
      }
    });
  }

  private createRandomRoute(): RouteMoment[] {
    const rng = new Phaser.Math.RandomDataGenerator([String(this.routeSeed)]);
    const everydayFoodIds = Object.values(this.level.foods)
      .filter((food) => food.category === 'everyday')
      .map((food) => food.id);
    const treatFoodIds = Object.values(this.level.foods)
      .filter((food) => food.category === 'treat')
      .map((food) => food.id);
    const pick = (ids: string[]) => ids[Math.floor(rng.frac() * ids.length)] ?? ids[0];
    const between = (min: number, max: number) => Math.floor(rng.frac() * (max - min + 1)) + min;
    const route: RouteMoment[] = [
      { kind: 'runCollect', x: ROUTE_START_X, foodId: pick(everydayFoodIds) },
      { kind: 'jumpCollect', x: ROUTE_START_X + 440, foodId: pick(everydayFoodIds) },
      { kind: 'rest', x: ROUTE_START_X + 700 },
      { kind: 'avoid', x: ROUTE_START_X + 900, obstacleId: pick(treatFoodIds) },
    ];

    let x = ROUTE_START_X + 1360;
    let previousKind: RouteMoment['kind'] = 'avoid';
    while (x < this.level.worldLength - ROUTE_END_PADDING) {
      const roll = rng.frac();
      let kind: RouteMoment['kind'];
      if (roll < 0.09) {
        kind = 'rest';
      } else if (roll < 0.31) {
        kind = 'avoid';
      } else if (roll < 0.58) {
        kind = 'jumpCollect';
      } else if (roll < 0.73) {
        kind = 'combo';
      } else {
        kind = 'runCollect';
      }

      if (previousKind === 'avoid' && kind === 'avoid') {
        kind = rng.frac() > 0.5 ? 'jumpCollect' : 'runCollect';
      }

      if (kind === 'rest') {
        route.push({ kind, x });
      } else if (kind === 'avoid') {
        route.push({ kind, x, obstacleId: pick(treatFoodIds) });
      } else if (kind === 'combo') {
        route.push({
          kind,
          x,
          foodId: pick(everydayFoodIds),
          obstacleId: pick(treatFoodIds),
        });
      } else {
        route.push({ kind, x, foodId: pick(everydayFoodIds) });
      }

      previousKind = kind;
      x += between(ROUTE_MIN_SPACING, ROUTE_MAX_SPACING) + (kind === 'combo' ? 110 : 0);
    }

    return route;
  }

  private createCollectible(x: number, lane: 'low' | 'high', food: FoodDefinition) {
    const bottomY = lane === 'high' ? ITEM_JUMP_BOTTOM_Y : ITEM_GROUND_BOTTOM_Y;
    const centerY = lane === 'high' ? bottomY - 46 : ITEM_LOW_CENTER_Y;

    const glow = this.add.ellipse(x, centerY, 118, lane === 'high' ? 104 : 92, 0xfff3a4, 0.46)
      .setDepth(8);
    this.tweens.add({
      targets: glow,
      alpha: 0.22,
      scaleX: 1.16,
      scaleY: 1.12,
      duration: 740,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    const visual = this.add.text(x, bottomY, food.icon, {
      fontSize: lane === 'high' ? '72px' : '60px',
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif',
      align: 'center',
    })
      .setOrigin(0.5, 1)
      .setDepth(10);

    const hitZone = this.add.zone(x, lane === 'high' ? centerY : ITEM_LOW_BODY_Y, 96, 100) as CollectibleObject;
    hitZone.setData('food', food);
    hitZone.setData('lane', lane);
    hitZone.setData('glow', glow);
    hitZone.setData('visual', visual);
    this.physics.add.existing(hitZone);
    hitZone.body.setAllowGravity(false);
    hitZone.body.setCircle(46, 2, 4);
    this.collectibles.add(hitZone);

    this.tweens.add({
      targets: [visual, glow],
      y: '-=12',
      duration: 920,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private createObstacle(x: number, food: FoodDefinition) {
    const pad = this.add.ellipse(x, ITEM_GROUND_BOTTOM_Y - 18, 116, 42, 0xffd0bd, 0.72)
      .setDepth(7);
    const visual = this.add.text(x, ITEM_GROUND_BOTTOM_Y, food.icon, {
      fontSize: food.icon.includes('🧃') ? '56px' : '72px',
      fontFamily: 'Apple Color Emoji, Segoe UI Emoji, sans-serif',
      align: 'center',
    })
      .setOrigin(0.5, 1)
      .setDepth(10);

    const hitZone = this.add.zone(x, ITEM_LOW_BODY_Y, 90, 126) as ObstacleObject;
    hitZone.setData('food', food);
    hitZone.setData('pad', pad);
    hitZone.setData('visual', visual);
    this.physics.add.existing(hitZone);
    hitZone.body.setAllowGravity(false);
    hitZone.body.setImmovable(true);
    hitZone.body.setSize(82, 130, true);
    this.obstacles.add(hitZone);

    this.tweens.add({
      targets: [visual, pad],
      y: '-=8',
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private createRescueGate() {
    const x = this.level.worldLength - 470;
    const gate = this.add.container(x, GROUND_Y - 136).setDepth(6);
    const frame = this.add.graphics();
    frame.fillStyle(0xc18f52, 1);
    frame.fillRoundedRect(-190, -240, 380, 300, 14);
    frame.fillStyle(0xf4d097, 1);
    frame.fillRoundedRect(-148, -198, 296, 240, 12);
    frame.fillStyle(0x8f6235, 1);
    frame.fillRect(-190, 26, 380, 48);
    gate.add(frame);

    gate.add(this.add.text(0, -224, '♡', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '76px',
      color: '#f38aaa',
      fontStyle: 'bold',
    }).setOrigin(0.5));

    const pigFaces = [
      { x: -82, y: -88, scale: 1.05, glasses: true },
      { x: 62, y: -84, scale: 1.03 },
      { x: -118, y: 10, scale: 0.72 },
      { x: -12, y: 18, scale: 0.66 },
      { x: 96, y: 10, scale: 0.72 },
    ];

    pigFaces.forEach((pig, index) => {
      const face = this.add.container(pig.x, pig.y).setScale(pig.scale);
      face.add(this.add.circle(0, 0, 46, 0xf3aaa7));
      face.add(this.add.triangle(-26, -36, -20, 0, 2, -34, 20, 0, 0xf6b6b2));
      face.add(this.add.triangle(26, -36, -20, 0, 2, -34, 20, 0, 0xf6b6b2).setAngle(48));
      face.add(this.add.ellipse(0, 10, 42, 28, 0xe99393));
      face.add(this.add.circle(-14, -6, 4, 0x1c2328));
      face.add(this.add.circle(14, -6, 4, 0x1c2328));
      face.add(this.add.circle(-8, 10, 3, 0x713939));
      face.add(this.add.circle(8, 10, 3, 0x713939));
      if (pig.glasses) {
        face.add(this.add.circle(-15, -5, 14).setStrokeStyle(3, 0x314154));
        face.add(this.add.circle(15, -5, 14).setStrokeStyle(3, 0x314154));
        face.add(this.add.line(0, 0, -1, -5, 1, -5, 0x314154).setLineWidth(3));
      }
      gate.add(face);
      this.tweens.add({
        targets: face,
        y: pig.y - 8,
        duration: 800 + index * 140,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });
  }

  private createFamilySupporters() {
    FAMILY_SUPPORTERS.forEach((supporter, index) => {
      const zone = this.level.zones[supporter.zoneIndex % this.level.zones.length];
      if (!zone) return;
      const x = zone.startX + 1030 + (index % 2) * 210;
      const baseY = GROUND_Y - 34;
      const container = this.add.container(x, baseY)
        .setDepth(6)
        .setAlpha(0.98);
      const sprite = this.add.image(0, 0, `supporter-${supporter.key}-wave-0`)
        .setOrigin(0.5, 1)
        .setScale(supporter.scale);
      container.add(sprite);
      let waveFrame = 0;

      this.tweens.add({
        targets: container,
        y: baseY - 10,
        angle: index % 2 === 0 ? 0.8 : -0.8,
        duration: 980 + index * 85,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });

      this.time.addEvent({
        delay: 240 + index * 18,
        loop: true,
        callback: () => {
          waveFrame = (waveFrame + 1) % 3;
          sprite.setTexture(`supporter-${supporter.key}-wave-${waveFrame}`);
        },
      });

      this.time.addEvent({
        delay: 2600 + index * 180,
        loop: true,
        callback: () => this.showSupporterCheer(container.x + 42, container.y - 170 - (index % 3) * 16),
      });
    });
  }

  private showSupporterCheer(x: number, y: number) {
    if (!this.started || this.parentPaused || this.finished || this.recapActive) return;
    if (Math.abs((this.player?.x ?? 0) - x) > 900) return;
    const cheer = this.add.text(x, y, '♡', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '34px',
      color: '#ff82ad',
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 5,
    })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0.78);
    this.tweens.add({
      targets: cheer,
      y: y - 54,
      scale: 1.26,
      alpha: 0,
      duration: 820,
      ease: 'Quad.out',
      onComplete: () => cheer.destroy(),
    });
  }

  private createPlayer() {
    this.createPlayerAnimations();
    const cousinLead = this.playerMode === 'cousin';
    this.player = this.physics.add.sprite(
      PLAYER_START_X,
      cousinLead ? GROUND_Y - 102 : GROUND_Y - 116,
      cousinLead ? 'supporter-zoe-wave-0' : 'baby-rae',
    )
      .setScale(cousinLead ? ZOE_LEAD_SCALE : RAE_PLAYER_SCALE)
      .setDepth(20);
    this.playHeroAnimation('idle');
    this.player.setCollideWorldBounds(false);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    if (cousinLead) {
      playerBody.setSize(58, 116);
      playerBody.setOffset(27, 66);
    } else {
      playerBody.setSize(74, 118);
      playerBody.setOffset(59, 68);
    }
    this.player.setMaxVelocity(240, 900);

    if (this.playerMode === 'pair') {
      this.createCompanion();
    }

    const groundCollider = this.physics.add.staticGroup();
    const groundBody = this.add.rectangle(
      this.level.worldLength / 2,
      GROUND_Y + 50,
      this.level.worldLength,
      100,
      0x000000,
      0,
    );
    groundCollider.add(groundBody);
    this.physics.add.collider(this.player, groundCollider);
  }

  private createPlayerAnimations() {
    if (!this.anims.exists('rae-run')) {
      this.anims.create({
        key: 'rae-run',
        frames: this.anims.generateFrameNumbers('baby-rae', { start: 8, end: 15 }),
        frameRate: 10,
        repeat: -1,
      });
    }
    if (!this.anims.exists('rae-idle')) {
      this.anims.create({
        key: 'rae-idle',
        frames: this.anims.generateFrameNumbers('baby-rae', { start: 0, end: 5 }),
        frameRate: 5,
        repeat: -1,
      });
    }
    if (!this.anims.exists('rae-jump')) {
      this.anims.create({
        key: 'rae-jump',
        frames: this.anims.generateFrameNumbers('baby-rae', { start: 32, end: 36 }),
        frameRate: 8,
        repeat: 0,
      });
    }

    if (!this.anims.exists('zoe-run')) {
      this.anims.create({
        key: 'zoe-run',
        frames: [
          { key: 'supporter-zoe-wave-0' },
          { key: 'supporter-zoe-wave-1' },
          { key: 'supporter-zoe-wave-2' },
          { key: 'supporter-zoe-wave-1' },
        ],
        frameRate: 9,
        repeat: -1,
      });
    }
    if (!this.anims.exists('zoe-idle')) {
      this.anims.create({
        key: 'zoe-idle',
        frames: [
          { key: 'supporter-zoe-wave-0' },
          { key: 'supporter-zoe-wave-1' },
          { key: 'supporter-zoe-wave-2' },
          { key: 'supporter-zoe-wave-1' },
        ],
        frameRate: 4,
        repeat: -1,
      });
    }
    if (!this.anims.exists('zoe-jump')) {
      this.anims.create({
        key: 'zoe-jump',
        frames: [{ key: 'supporter-zoe-wave-2' }],
        frameRate: 1,
        repeat: 0,
      });
    }
  }

  private createCompanion() {
    this.companion = this.add.sprite(
      this.player.x - ZOE_COMPANION_OFFSET_X,
      this.player.y + ZOE_COMPANION_OFFSET_Y,
      'supporter-zoe-wave-0',
    )
      .setOrigin(0.5, 1)
      .setScale(ZOE_COMPANION_SCALE)
      .setDepth(19);
    this.companion.play('zoe-idle');
    this.syncCompanionToPlayer();
  }

  private playHeroAnimation(state: 'idle' | 'run' | 'jump', ignoreIfPlaying = false) {
    const leadPrefix = this.playerMode === 'cousin' ? 'zoe' : 'rae';
    this.player.play(`${leadPrefix}-${state}`, ignoreIfPlaying);
    if (this.companion) {
      this.companion.play(`zoe-${state}`, ignoreIfPlaying);
    }
  }

  private syncCompanionToPlayer() {
    if (!this.companion) return;
    const runningBob = this.started && !this.parentPaused && !this.finished ? Math.sin(this.time.now / 95) * 2 : 0;
    const idleTilt = Math.sin(this.time.now / 360) * 1.1;
    this.companion.setPosition(
      this.player.x - ZOE_COMPANION_OFFSET_X,
      this.player.y + ZOE_COMPANION_OFFSET_Y + runningBob,
    );
    this.companion.setAngle(idleTilt);
  }

  private tintHero(color: number) {
    this.player.setTint(color);
    this.companion?.setTint(color);
  }

  private clearHeroTint() {
    this.player.clearTint();
    this.companion?.clearTint();
  }

  private heroLabel() {
    if (this.playerMode === 'pair') return 'Rae and Zoe';
    if (this.playerMode === 'cousin') return 'Zoe';
    return 'Rae';
  }

  private viewportWidth() {
    return Math.max(GAME_WIDTH, this.scale.gameSize.width || GAME_WIDTH);
  }

  private viewportHeight() {
    return Math.max(GAME_HEIGHT, this.scale.gameSize.height || GAME_HEIGHT);
  }

  private createHud() {
    const hudDepth = 100;
    const choicePanel = this.createHudPill(34, 28, 152, 72, '');
    choicePanel.setDepth(hudDepth);
    this.createHealthierChoiceBadge(74, 64, hudDepth + 1);
    this.starText = this.add.text(138, 64, '0', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '34px',
      color: '#4a3b2d',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hudDepth + 1);

    const basketPanel = this.createHudPill(214, 28, 176, 72, '🧺');
    basketPanel.setDepth(hudDepth);
    this.basketText = this.add.text(314, 64, '0', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '34px',
      color: '#4a3b2d',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hudDepth + 1);

    const timerPanel = this.createHudPill(410, 28, 138, 72, '⏱');
    timerPanel.setDepth(hudDepth);
    this.timerText = this.add.text(502, 64, '0:00', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '28px',
      color: '#4a3b2d',
      fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(hudDepth + 1);

    this.createProgressTrail();
    this.spacePrompt = this.createSpacePrompt();
    this.pauseOverlay = this.createPauseOverlay();
    this.recapOverlay = this.createRecapOverlay();
    this.pauseOverlay.setVisible(false);
    this.recapOverlay.setVisible(false);
  }

  private createHudPill(x: number, y: number, width: number, height: number, icon: string) {
    const container = this.add.container(x, y).setScrollFactor(0);
    const bg = this.add.graphics();
    bg.fillStyle(0xfffbf0, 0.94);
    bg.fillRoundedRect(0, 0, width, height, 22);
    bg.lineStyle(4, 0xffffff, 0.88);
    bg.strokeRoundedRect(0, 0, width, height, 22);
    container.add(bg);
    if (icon) {
      container.add(this.add.text(46, 37, icon, { fontSize: '40px' }).setOrigin(0.5));
    }
    return container;
  }

  private createHealthierChoiceBadge(
    x: number,
    y: number,
    depth: number,
    scrollFactor = 0,
    scale = 1,
  ) {
    const badge = this.add.container(x, y)
      .setScrollFactor(scrollFactor)
      .setDepth(depth)
      .setScale(scale);
    const ring = this.add.graphics();
    ring.fillStyle(0xffffff, 0.98);
    ring.fillCircle(0, 0, 27);
    ring.lineStyle(3, 0xee8062, 0.95);
    ring.strokeCircle(0, 0, 27);
    ring.lineStyle(1, 0xffd8c9, 0.75);
    ring.strokeCircle(0, 0, 22);

    const pyramid = this.add.graphics();
    pyramid.fillStyle(0xee1f32, 1);
    pyramid.fillTriangle(0, -15, -8, -4, 8, -4);
    this.drawChoiceBand(pyramid, -1, 15, 26, 6, 0xf04a39);
    this.drawChoiceBand(pyramid, 7, 25, 39, 7, 0xf48b68);
    this.drawChoiceBand(pyramid, 16, 37, 51, 7, 0xf6ae8a);

    badge.add(ring);
    badge.add(pyramid);
    badge.add(this.add.text(0, -21, 'HEALTHIER', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '7px',
      color: '#e22d38',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    badge.add(this.add.text(0, 22, 'CHOICE', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '7px',
      color: '#e22d38',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    return badge;
  }

  private drawChoiceBand(
    target: Phaser.GameObjects.Graphics,
    y: number,
    topWidth: number,
    bottomWidth: number,
    height: number,
    color: number,
  ) {
    target.fillStyle(color, 1);
    target.fillTriangle(-topWidth / 2, y, topWidth / 2, y, -bottomWidth / 2, y + height);
    target.fillTriangle(topWidth / 2, y, bottomWidth / 2, y + height, -bottomWidth / 2, y + height);
  }

  private showHealthierChoiceReward(x: number, y: number) {
    const badge = this.createHealthierChoiceBadge(x, y, 62, 1, 1.16)
      .setAlpha(0.96);
    this.tweens.add({
      targets: badge,
      y: y - 76,
      scale: 1.28,
      alpha: 0,
      duration: 880,
      ease: 'Quad.out',
      onComplete: () => badge.destroy(),
    });
  }

  private createProgressTrail() {
    const viewWidth = this.viewportWidth();
    const y = 68;
    const spacing = 140;
    const lineWidth = (ROUTE_MILESTONES - 1) * spacing;
    const startX = Math.max(560, viewWidth / 2 - lineWidth / 2);
    this.add.line(startX + lineWidth / 2, y, 0, 0, lineWidth, 0, 0xffffff, 0.86)
      .setLineWidth(12)
      .setScrollFactor(0)
      .setDepth(102);
    for (let index = 0; index < ROUTE_MILESTONES; index += 1) {
      const dot = this.add.circle(startX + index * spacing, y, 28, index === 0 ? 0x78ce52 : 0xe8edf0)
        .setScrollFactor(0)
        .setDepth(104)
        .setStrokeStyle(8, 0xffffff, 0.92);
      this.progressDots.push(dot);
    }
    this.add.text(startX - 58, y, this.playerMode === 'pair' ? '👧👧' : '👧', { fontSize: '40px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(105);
    this.add.text(startX + lineWidth + 24, y, '🐷', { fontSize: '42px' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(105);
  }

  private createSpacePrompt() {
    const viewHeight = this.viewportHeight();
    const container = this.add.container(this.viewportWidth() / 2, viewHeight - 78)
      .setScrollFactor(0)
      .setDepth(110);
    const bg = this.add.graphics();
    bg.fillStyle(0xfffbf7, 0.94);
    bg.fillRoundedRect(-190, -58, 380, 116, 24);
    bg.lineStyle(6, 0x6d7077, 0.85);
    bg.strokeRoundedRect(-190, -58, 380, 116, 24);
    bg.fillStyle(0x656971, 0.9);
    bg.fillRoundedRect(-48, 26, 96, 10, 5);
    container.add(bg);
    container.add(
      this.add.text(0, -10, 'TAP / SPACE', {
        fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
        fontSize: '38px',
        color: '#3d434a',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    this.tweens.add({
      targets: container,
      y: viewHeight - 88,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    return container;
  }

  private createPauseOverlay() {
    const viewWidth = this.viewportWidth();
    const viewHeight = this.viewportHeight();
    const overlay = this.add.container(viewWidth / 2, viewHeight / 2)
      .setScrollFactor(0)
      .setDepth(160);
    overlay.add(this.add.rectangle(0, 0, viewWidth, viewHeight, 0x163140, 0.3));
    overlay.add(this.add.rectangle(0, 0, 430, 170, 0xffffff, 0.92).setStrokeStyle(4, 0xffa9c5));
    overlay.add(this.add.text(0, -34, 'Paused', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '48px',
      color: '#344050',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(0, 34, 'Tap Pause or press P', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '26px',
      color: '#64717d',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    return overlay;
  }

  private createRecapOverlay() {
    const viewWidth = this.viewportWidth();
    const viewHeight = this.viewportHeight();
    const overlay = this.add.container(viewWidth / 2, viewHeight / 2)
      .setScrollFactor(0)
      .setDepth(170);
    overlay.add(this.add.rectangle(0, 0, viewWidth, viewHeight, 0x153544, 0.22));
    overlay.add(this.add.rectangle(0, 0, 720, 360, 0xfffbf0, 0.96).setStrokeStyle(5, 0xffa2c0));
    overlay.add(this.add.text(0, -120, `${this.heroLabel()} filled the basket!`, {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '42px',
      color: '#344050',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(0, -60, '🍎  🐟  🍓  🥒  🥛  🥬', {
      fontSize: '52px',
    }).setOrigin(0.5));
    overlay.add(this.add.text(0, 12, 'Good choice!', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '42px',
      color: '#58a85a',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(0, 78, '🍩  🍟  🥤  small bites', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '30px',
      color: '#7d6b61',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    overlay.add(this.add.text(0, 140, 'Tap / SPACE skips', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#77818d',
      fontStyle: 'bold',
    }).setOrigin(0.5));
    return overlay;
  }

  private createInput() {
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pauseKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);

    this.spaceKey.on('down', () => this.handleSpace());
    this.pauseKey.on('down', () => this.toggleParentPause());
    this.input.on('pointerdown', () => this.handleSpace());
  }

  private createEventBridge() {
    const togglePause = () => this.toggleParentPause();
    const setSpeed = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: SpeedMode }>).detail.mode;
      if (mode in SPEEDS) this.currentSpeedMode = mode;
    };
    const setMuted = (event: Event) => {
      this.muted = Boolean((event as CustomEvent<{ muted: boolean }>).detail.muted);
      this.audio.setMuted(this.muted);
    };
    const setPlayerMode = (event: Event) => {
      const mode = (event as CustomEvent<{ mode: PlayerMode }>).detail.mode;
      if (!PLAYER_MODES.has(mode) || mode === this.playerMode) return;
      this.playerMode = mode;
      this.resetRun();
    };
    const resetRun = () => this.resetRun();
    const finishForQa = () => {
      if (import.meta.env.DEV) this.finishLevel();
    };

    window.addEventListener('hfcg:toggle-pause', togglePause);
    window.addEventListener('hfcg:set-speed', setSpeed);
    window.addEventListener('hfcg:set-muted', setMuted);
    window.addEventListener('hfcg:set-player-mode', setPlayerMode);
    window.addEventListener('hfcg:reset-run', resetRun);
    window.addEventListener('hfcg:qa-finish', finishForQa);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('hfcg:toggle-pause', togglePause);
      window.removeEventListener('hfcg:set-speed', setSpeed);
      window.removeEventListener('hfcg:set-muted', setMuted);
      window.removeEventListener('hfcg:set-player-mode', setPlayerMode);
      window.removeEventListener('hfcg:reset-run', resetRun);
      window.removeEventListener('hfcg:qa-finish', finishForQa);
      this.audio.destroy();
    });
  }

  private resetRun() {
    this.physics.resume();
    this.tweens.resumeAll();
    window.dispatchEvent(new CustomEvent('hfcg:pause-state', { detail: { paused: false } }));
    this.scene.restart({ speedMode: this.currentSpeedMode, playerMode: this.playerMode });
  }

  private handleSpace() {
    this.audio.unlock();

    if (this.recapActive) {
      this.finishRecap();
      return;
    }

    if (this.finished) {
      this.scene.restart({ speedMode: this.currentSpeedMode, playerMode: this.playerMode });
      return;
    }

    if (!this.started) {
      this.started = true;
      this.runStartedAt = this.time.now;
      this.playHeroAnimation('run');
      this.player.setVelocityX(SPEEDS[this.currentSpeedMode]);
      this.audio.startMusic();
      this.audio.speakTiny('ready', 'Ready?');
      return;
    }

    if (this.parentPaused) return;

    this.lastJumpAt = this.time.now;
    this.prepareNearbyObstacleDodge();

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const nearGround = this.player.y >= GROUND_Y - 138;
    if (body.blocked.down || body.touching.down || nearGround) {
      this.player.setVelocityY(-720);
      this.playHeroAnimation('jump', true);
      this.syncCompanionToPlayer();
      this.audio.jump();
      this.tweens.add({
        targets: this.spacePrompt,
        scale: 0.94,
        duration: 80,
        yoyo: true,
        ease: 'Sine.out',
      });
      this.time.delayedCall(520, () => {
        if (!this.finished && !this.recapActive && this.started) {
          this.playHeroAnimation('run', true);
        }
      });
    }
  }

  private collectFood(icon: CollectibleObject) {
    if (icon.getData('collected')) return;
    icon.setData('collected', true);
    const food = icon.getData('food') as FoodDefinition;
    const glow = icon.getData('glow') as Phaser.GameObjects.Ellipse;
    const visual = icon.getData('visual') as Phaser.GameObjects.Text;
    this.basket += 1;
    this.stars += food.starValue;
    this.audio.collect();
    this.audio.speakTiny(`food-${food.id}-${Math.round(icon.x)}`, food.voice);
    this.showHealthierChoiceReward(icon.x, visual.y - visual.displayHeight / 2 - 8);
    this.spawnHeartBurst(icon.x, visual.y - visual.displayHeight / 2);
    this.updateHud();

    this.tweens.add({
      targets: [visual, glow],
      y: '-=70',
      alpha: 0,
      scale: 1.35,
      duration: 260,
      ease: 'Quad.out',
      onComplete: () => {
        glow.destroy();
        visual.destroy();
        icon.destroy();
      },
    });
  }

  private hitObstacle(icon: ObstacleObject) {
    if (icon.getData('hit')) return;
    const now = this.time.now;
    if (now - this.lastObstacleHitAt < 650) return;
    this.lastObstacleHitAt = now;
    icon.setData('hit', true);
    const food = icon.getData('food') as FoodDefinition;
    const visual = icon.getData('visual') as Phaser.GameObjects.Text;
    this.audio.smallBite();
    this.audio.speakTiny(`treat-${food.id}-${Math.round(icon.x)}`, food.voice);
    this.updateHud();
    this.showTinyFeedback(icon.x, ITEM_GROUND_BOTTOM_Y - 130, food.feedback ?? 'Small bites', '#f2a14a');
    this.player.setVelocityY(-180);
    this.tintHero(0xffd9a8);
    this.time.delayedCall(220, () => this.clearHeroTint());

    this.tweens.add({
      targets: visual,
      angle: 10,
      alpha: 0.58,
      duration: 90,
      yoyo: true,
      repeat: 2,
      onComplete: () => visual.setAlpha(0.45),
    });
  }

  private spawnHeartBurst(x: number, y: number) {
    for (let i = 0; i < 5; i += 1) {
      const heart = this.add.text(x, y, i % 2 === 0 ? '♡' : '✓', {
        fontSize: i % 2 === 0 ? '26px' : '22px',
        color: i % 2 === 0 ? '#ff78a9' : '#58a85a',
        fontFamily: 'Arial, sans-serif',
      })
        .setOrigin(0.5)
        .setDepth(40);
      this.tweens.add({
        targets: heart,
        x: x + Phaser.Math.Between(-70, 70),
        y: y - Phaser.Math.Between(60, 120),
        alpha: 0,
        duration: 620,
        ease: 'Quad.out',
        onComplete: () => heart.destroy(),
      });
    }
  }

  private updateHud() {
    this.starText.setText(String(this.stars));
    this.basketText.setText(String(this.basket));
    const elapsedMs = this.started && this.runStartedAt > 0
      ? Math.max(0, this.time.now - this.runStartedAt - this.pausedDurationMs)
      : 0;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    this.timerText.setText(`${minutes}:${String(seconds).padStart(2, '0')}`);

    const progress = Phaser.Math.Clamp(this.player.x / this.level.worldLength, 0, 1);
    const activeDot = Math.min(this.progressDots.length - 1, Math.floor(progress * this.progressDots.length));
    this.progressDots.forEach((dot, index) => {
      dot.setFillStyle(index <= activeDot ? 0x78ce52 : 0xe8edf0, 1);
      dot.setScale(index === activeDot ? 1.12 : 1);
    });
  }

  private publishDebugState() {
    if (!import.meta.env.DEV || !this.player || !this.obstacles) return;

    const nextObstacle = this.obstacles.getChildren()
      .map((child) => child as ObstacleObject)
      .filter((obstacle) => !obstacle.getData('hit') && !obstacle.getData('avoided'))
      .sort((left, right) => left.x - right.x)[0];
    const obstacleStats = this.obstacles.getChildren()
      .map((child) => child as ObstacleObject)
      .reduce((stats, obstacle) => ({
        avoided: stats.avoided + (obstacle.getData('avoided') ? 1 : 0),
        hit: stats.hit + (obstacle.getData('hit') ? 1 : 0),
        prepared: stats.prepared + (obstacle.getData('dodgePrepared') ? 1 : 0),
      }), { avoided: 0, hit: 0, prepared: 0 });
    const food = nextObstacle?.getData('food') as FoodDefinition | undefined;

    const debugState: RunnerDebugState = {
      basket: this.basket,
      cameraScrollX: Math.round(this.cameras.main.scrollX),
      currentZoneId: this.currentZoneId,
      nextObstacle: nextObstacle && food ? {
        distance: Math.round(nextObstacle.x - this.player.x),
        dodgePrepared: Boolean(nextObstacle.getData('dodgePrepared')),
        foodId: food.id,
        x: Math.round(nextObstacle.x),
      } : null,
      obstacleStats,
      playerMode: this.playerMode,
      playerScreenX: Math.round(this.player.x - this.cameras.main.scrollX),
      playerX: Math.round(this.player.x),
      routeSeed: this.routeSeed,
      stars: this.stars,
      started: this.started,
      worldLength: this.level.worldLength,
    };
    (window as RunnerDebugWindow).__hfcgDebug = debugState;
    document.documentElement.dataset.hfcgDebug = JSON.stringify(debugState);
  }

  private updateCamera() {
    const targetScrollX = Phaser.Math.Clamp(
      this.player.x - 280,
      0,
      Math.max(0, this.level.worldLength - this.viewportWidth()),
    );
    this.lastCameraScrollX = Phaser.Math.Linear(this.lastCameraScrollX, targetScrollX, 0.14);
    this.cameras.main.scrollX = this.lastCameraScrollX;
  }

  private updateCollectibleEncounters() {
    this.collectibles.getChildren().forEach((child) => {
      const collectible = child as CollectibleObject;
      if (collectible.getData('collected')) return;

      const lane = collectible.getData('lane') as 'low' | 'high';
      const range = lane === 'high' ? HIGH_COLLECT_RANGE_X : LOW_COLLECT_RANGE_X;
      if (Math.abs(this.player.x - collectible.x) > range) return;
      if (lane === 'high' && !this.isPlayerAirborne()) return;

      this.collectFood(collectible);
    });
  }

  private updateObstacleCollisions() {
    this.obstacles.getChildren().forEach((child) => {
      const obstacle = child as ObstacleObject;
      if (obstacle.getData('hit') || obstacle.getData('avoided')) return;
      if (Math.abs(this.player.x - obstacle.x) > OBSTACLE_HIT_RANGE_X) return;
      if (this.canDodgeObstacle(obstacle)) {
        obstacle.setData('dodgePrepared', true);
        return;
      }

      this.hitObstacle(obstacle);
    });
  }

  private updateObstacleAvoidance() {
    this.obstacles.getChildren().forEach((child) => {
      const obstacle = child as ObstacleObject;
      if (obstacle.getData('hit') || obstacle.getData('avoided')) return;
      if (this.player.x > obstacle.x + OBSTACLE_CLEAR_RANGE_X) {
        obstacle.setData('avoided', true);
        this.updateHud();
        this.showTinyFeedback(obstacle.x, ITEM_GROUND_BOTTOM_Y - 130, 'Nice jump!', '#58a85a');
        this.spawnHeartBurst(obstacle.x, ITEM_GROUND_BOTTOM_Y - 140);
      }
    });
  }

  private prepareNearbyObstacleDodge() {
    const nextObstacle = this.obstacles.getChildren()
      .map((child) => child as ObstacleObject)
      .filter((obstacle) => (
        !obstacle.getData('hit')
        && !obstacle.getData('avoided')
        && obstacle.x >= this.player.x - OBSTACLE_HIT_RANGE_X
        && obstacle.x <= this.player.x + OBSTACLE_DODGE_PREP_RANGE_X
      ))
      .sort((left, right) => left.x - right.x)[0];

    if (nextObstacle) {
      nextObstacle.setData('dodgePrepared', true);
    }
  }

  private canDodgeObstacle(obstacle: ObstacleObject) {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isOffGround = Math.abs(body.velocity.y) > 40 || (!(body.blocked.down || body.touching.down));
    const recentJump = this.time.now - this.lastJumpAt < DODGE_FORGIVE_MS;
    const clearsObstacle = this.player.y < GROUND_Y - 94;
    const forgivingJumpWindow = recentJump && this.player.y < GROUND_Y - 84;
    const preparedJumpGrace = Boolean(obstacle.getData('dodgePrepared')) && recentJump;
    return (isOffGround && (clearsObstacle || forgivingJumpWindow)) || preparedJumpGrace;
  }

  private isPlayerAirborne() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.time.now - this.lastJumpAt < JUMP_INPUT_GRACE_MS && this.player.y < GROUND_Y - 130) return true;
    return Math.abs(body.velocity.y) > 40 || (!(body.blocked.down || body.touching.down) && this.player.y < GROUND_Y - 122);
  }

  private showTinyFeedback(x: number, y: number, text: string, color: string) {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '30px',
      color,
      fontStyle: 'bold',
      stroke: '#ffffff',
      strokeThickness: 7,
    })
      .setOrigin(0.5)
      .setDepth(60);
    this.tweens.add({
      targets: label,
      y: y - 58,
      alpha: 0,
      duration: 760,
      ease: 'Quad.out',
      onComplete: () => label.destroy(),
    });
  }

  private updateZone() {
    const zone = this.level.zones.find(
      (candidate) => this.player.x >= candidate.startX && this.player.x < candidate.endX,
    );
    if (!zone || zone.id === this.currentZoneId) return;
    this.currentZoneId = zone.id;
    this.audio.setMood(zone.id);
    this.cameras.main.setBackgroundColor(zone.sky);
  }

  private toggleParentPause() {
    if (this.finished || this.recapActive) return;
    this.parentPaused = !this.parentPaused;
    if (this.parentPaused) {
      this.pausedStartedAt = this.time.now;
      this.player.setVelocityX(0);
      this.physics.pause();
      this.tweens.pauseAll();
      this.player.anims.pause();
      this.companion?.anims.pause();
      this.audio.pause();
    } else {
      if (this.pausedStartedAt > 0) {
        this.pausedDurationMs += this.time.now - this.pausedStartedAt;
        this.pausedStartedAt = 0;
      }
      this.physics.resume();
      this.tweens.resumeAll();
      this.player.anims.resume();
      this.companion?.anims.resume();
      this.audio.resume();
    }
    this.pauseOverlay.setVisible(this.parentPaused);
    window.dispatchEvent(new CustomEvent('hfcg:pause-state', { detail: { paused: this.parentPaused } }));
  }

  private finishLevel() {
    if (this.finished) return;
    this.finished = true;
    this.player.setVelocity(0, 0);
    this.playHeroAnimation('idle', true);
    this.audio.rescue();
    this.audio.speakTiny('rescue', 'Yay!');
    this.cameras.main.pan(this.level.worldLength - 520, GAME_HEIGHT / 2, 900, 'Sine.easeInOut');
    this.time.delayedCall(850, () => this.showRecap());
  }

  private showRecap() {
    this.recapActive = true;
    this.recapOverlay.setVisible(true).setAlpha(0);
    this.audio.speakTiny('recap-good', 'Good choice!');
    this.tweens.add({
      targets: this.recapOverlay,
      alpha: 1,
      duration: 260,
      ease: 'Quad.out',
    });
    this.time.delayedCall(6200, () => {
      if (this.recapActive) this.finishRecap();
    });
  }

  private finishRecap() {
    this.recapActive = false;
    this.recapOverlay.setVisible(false);
    this.audio.speakTiny('helped', 'You helped them!');
    const viewWidth = this.viewportWidth();
    const viewHeight = this.viewportHeight();
    const endText = this.add.text(viewWidth / 2, viewHeight / 2 - 10, `Yay ${this.heroLabel()}!`, {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '74px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#ff7eaa',
      strokeThickness: 12,
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(180);
    const replayText = this.add.text(viewWidth / 2, viewHeight / 2 + 82, 'Tap or SPACE to play again', {
      fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      fontSize: '30px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#425260',
      strokeThickness: 6,
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(180);
    this.tweens.add({
      targets: [endText, replayText],
      scale: 1.05,
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }
}
