export type SpeedMode = 'practice' | 'cozy' | 'adventure';

export type PlayerMode = 'pair' | 'rae' | 'cousin';

export type FoodCategory = 'everyday' | 'treat';

export interface FoodDefinition {
  id: string;
  label: string;
  icon: string;
  category: FoodCategory;
  voice: string;
  starValue: number;
}

export type RouteMomentKind = 'runCollect' | 'jumpCollect' | 'avoid' | 'combo' | 'rest';

export interface RouteMoment {
  kind: RouteMomentKind;
  x: number;
  foodId?: string;
  obstacleId?: string;
}

export interface LevelZone {
  id: string;
  name: string;
  startX: number;
  endX: number;
  sky: number;
  accent: number;
}

export interface LevelDefinition {
  id: string;
  title: string;
  worldLength: number;
  basketGoal: number;
  zones: LevelZone[];
  foods: Record<string, FoodDefinition>;
  route: RouteMoment[];
}
