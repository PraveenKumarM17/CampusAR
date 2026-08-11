import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { relativeBearingDeg as relativeBearingDegFromLib } from '../../lib/navigationHeading';

export type AvatarGender = 'male' | 'female';
export type AvatarPose = 'idle' | 'walk' | 'waveLeft' | 'waveRight' | 'celebrate';

const MARI = {
  idle: '/models/avatars/mari/idel.glb',
  walk: '/models/avatars/mari/walk.glb',
  wave: '/models/avatars/mari/wave.glb',
  celebrate: '/models/avatars/mari/sillyDance.glb',
} as const;

/** Head-to-toe height in world units. Frame shows roughly -0.9..0.8, so this leaves margin. */
const TARGET_HEIGHT = 0.6;
/** Ground line the feet are pinned to. */
const FOOT_Y = -0.34;
/** Model forward is +Z, so yaw 0 looks straight at the camera (wave / dance). */
const FACE_FRONT = 0;
/** Half turn puts her back to the user so she leads down the road (walk). */
const FACE_DOWN_ROAD = Math.PI;
/** How far she drifts across the lane when turning. */
const LANE_SHIFT = 0.28;

type ClipKey = 'idle' | 'walk' | 'wave' | 'celebrate';

function poseToClip(pose: AvatarPose): ClipKey {
  if (pose === 'celebrate') return 'celebrate';
  if (pose === 'waveLeft' || pose === 'waveRight') return 'wave';
  if (pose === 'walk') return 'walk';
  return 'idle';
}

/**
 * Mixamo bakes root motion into `mixamorig:Hips.position` at a mismatched unit scale.
 * Dropping that track keeps rotation-driven joints and pins her in place.
 */
function toInPlaceClip(animations: unknown, label: string): THREE.AnimationClip | null {
  const clips = animations as THREE.AnimationClip[];
  if (!clips?.length) return null;
  const longest = clips.reduce((a, b) => (b.duration >= a.duration ? b : a));
  const clip = longest.clone();
  clip.tracks = clip.tracks.filter((track) => !track.name.endsWith('Hips.position'));
  clip.name = label;
  return clip;
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });
  return found;
}

/** Asphalt strip + centre line so the guide reads as standing on the road. */
function RoadStrip() {
  return (
    <group position={[0, FOOT_Y - 0.005, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.85, 2.6]} />
        <meshStandardMaterial color="#3a3f46" roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.035, 2.3]} />
        <meshStandardMaterial color="#e8c547" roughness={0.7} />
      </mesh>
      <mesh position={[-0.39, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 2.45]} />
        <meshStandardMaterial color="#d8dde2" roughness={0.85} />
      </mesh>
      <mesh position={[0.39, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 2.45]} />
        <meshStandardMaterial color="#d8dde2" roughness={0.85} />
      </mesh>
    </group>
  );
}

function CameraRig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(0, 0.42, 3.1);
    camera.lookAt(0, -0.05, 0);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function MariGuide({ pose, pathYawDeg }: { pose: AvatarPose; pathYawDeg: number }) {
  const fit = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const stage = useRef<THREE.Group>(null);
  const fitted = useRef(false);
  const yaw = useRef(FACE_DOWN_ROAD);
  const lateral = useRef(0);

  const idleGltf = useGLTF(MARI.idle);
  const walkGltf = useGLTF(MARI.walk);
  const waveGltf = useGLTF(MARI.wave);
  const danceGltf = useGLTF(MARI.celebrate);

  const model = useMemo(() => {
    const cloned = cloneSkeleton(idleGltf.scene as unknown as THREE.Object3D) as THREE.Group;
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    return cloned;
  }, [idleGltf.scene]);

  useEffect(() => {
    fitted.current = false;
  }, [model]);

  const clips = useMemo(() => {
    const list = [
      toInPlaceClip(idleGltf.animations, 'idle'),
      toInPlaceClip(walkGltf.animations, 'walk'),
      toInPlaceClip(waveGltf.animations, 'wave'),
      toInPlaceClip(danceGltf.animations, 'celebrate'),
    ];
    return list.filter((clip): clip is THREE.AnimationClip => clip !== null);
  }, [idleGltf.animations, walkGltf.animations, waveGltf.animations, danceGltf.animations]);

  const { actions } = useAnimations(clips as never, inner as never);
  const clipKey = poseToClip(pose);

  useEffect(() => {
    const next = actions[clipKey] ?? actions.idle;
    if (!next) return;
    // Only one clip should ever drive the skeleton, otherwise blends fight each other.
    Object.entries(actions).forEach(([name, action]) => {
      if (action && name !== next.getClip().name) action.fadeOut(0.25);
    });
    next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.25).play();
  }, [actions, clipKey]);

  useFrame((_, delta) => {
    const clampedYaw = THREE.MathUtils.clamp(pathYawDeg, -85, 85);
    const onRoad = pose === 'walk';
    // Facing away, a right turn (+yaw) must swing her forward toward screen right.
    const targetYaw = onRoad ? FACE_DOWN_ROAD - THREE.MathUtils.degToRad(clampedYaw) : FACE_FRONT;
    const targetLateral = onRoad
      ? Math.sin(THREE.MathUtils.degToRad(clampedYaw)) * LANE_SHIFT
      : 0;

    yaw.current = THREE.MathUtils.damp(yaw.current, targetYaw, 8, delta);
    lateral.current = THREE.MathUtils.damp(lateral.current, targetLateral, 7, delta);
    if (inner.current) inner.current.rotation.y = yaw.current;
    if (stage.current) stage.current.position.x = lateral.current;

    if (fitted.current) return;

    const group = fit.current;
    const skinned = inner.current ? findSkinnedMesh(inner.current) : null;
    if (!group || !skinned) return;

    group.scale.setScalar(1);
    group.position.set(0, 0, 0);
    group.updateMatrixWorld(true);

    skinned.computeBoundingBox();
    const bounds = skinned.boundingBox;
    if (!bounds) return;

    // Measure in the fit group's own space so ancestor transforms can't skew the result.
    const toFitSpace = new THREE.Matrix4()
      .copy(group.matrixWorld)
      .invert()
      .multiply(skinned.matrixWorld);
    const box = bounds.clone().applyMatrix4(toFitSpace);

    const height = box.max.y - box.min.y;
    if (!Number.isFinite(height) || height < 1e-4) return;

    const scale = TARGET_HEIGHT / height;
    if (!Number.isFinite(scale) || scale <= 0) return;

    group.scale.setScalar(scale);
    group.position.set(
      -((box.min.x + box.max.x) / 2) * scale,
      FOOT_Y - box.min.y * scale,
      -((box.min.z + box.max.z) / 2) * scale,
    );
    group.updateMatrixWorld(true);
    fitted.current = true;
  });

  return (
    <group ref={stage as never}>
      <RoadStrip />
      <group ref={fit as never}>
        <group ref={inner as never}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(MARI.idle);
useGLTF.preload(MARI.walk);
useGLTF.preload(MARI.wave);
useGLTF.preload(MARI.celebrate);

function GuideFallback() {
  return (
    <mesh position={[0, FOOT_Y + TARGET_HEIGHT / 2, 0]}>
      <capsuleGeometry args={[0.09, 0.36, 4, 12]} />
      <meshStandardMaterial color="#148a80" />
    </mesh>
  );
}

export function GuideDollViewport({
  gender: _gender,
  pose,
  pathYawDeg = 0,
  className = '',
}: {
  gender: AvatarGender;
  pose: AvatarPose;
  /** Relative path bearing in degrees (0 ahead, −left, +right). */
  pathYawDeg?: number;
  className?: string;
}) {
  void _gender;

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0.42, 3.1], fov: 30 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.75]}
      >
        <CameraRig />
        <ambientLight intensity={0.75} />
        <directionalLight position={[2.5, 4.5, 3]} intensity={1.4} />
        <directionalLight position={[-2.5, 2, -1.5]} intensity={0.45} />
        <hemisphereLight args={['#f5f0ea', '#6b7c86', 0.5]} />
        <Suspense fallback={<GuideFallback />}>
          <MariGuide pose={pose} pathYawDeg={pathYawDeg} />
        </Suspense>
      </Canvas>
    </div>
  );
}

/**
 * Guide animation state:
 * 1. Wave once at route start
 * 2. Walk for the rest of the journey
 * 3. Silly dance on arrival
 */
export function poseFromRouteContext(input: {
  instruction?: string;
  nextInstruction?: string;
  distanceToNextM?: number;
  arrived: boolean;
  waveWithinM?: number;
  atRouteStart?: boolean;
  /** When false, doll idles instead of walking (visual only). */
  isMoving?: boolean;
}): AvatarPose {
  const { instruction, arrived, atRouteStart = false, isMoving = true } = input;
  if (arrived) return 'celebrate';
  if (instruction?.toLowerCase().includes('arrived')) return 'celebrate';
  if (atRouteStart) return 'waveRight';
  if (!isMoving) return 'idle';
  return 'walk';
}

/** @deprecated use poseFromRouteContext */
export function poseFromInstruction(instruction: string | undefined, arrived: boolean): AvatarPose {
  return poseFromRouteContext({ instruction, arrived });
}

/** Normalize compass delta into −180…180. */
export function relativeBearingDeg(targetBearing: number, heading: number | null): number {
  if (heading == null) return 0;
  return relativeBearingDegFromLib(targetBearing, heading);
}

function isTurnInstruction(instruction: string | undefined): boolean {
  if (!instruction) return false;
  const lower = instruction.toLowerCase();
  return lower.includes('left') || lower.includes('right') || lower.includes('u-turn');
}

/**
 * Bearing the guide should face: look ahead on the current leg, then start turning
 * toward the next leg when a turn is close.
 */
export function guideFacingBearing(input: {
  currentBearing?: number;
  nextBearing?: number;
  nextInstruction?: string;
  distanceToNextM?: number;
  turnWithinM?: number;
}): number {
  const {
    currentBearing = 0,
    nextBearing,
    nextInstruction,
    distanceToNextM = Infinity,
    turnWithinM = 28,
  } = input;

  if (nextBearing != null && isTurnInstruction(nextInstruction) && distanceToNextM <= turnWithinM) {
    const t = 1 - Math.min(1, distanceToNextM / turnWithinM);
    const delta = ((nextBearing - currentBearing + 540) % 360) - 180;
    return (currentBearing + delta * t + 360) % 360;
  }

  return currentBearing;
}
