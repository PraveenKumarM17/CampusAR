import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { relativeBearingDeg as relativeBearingDegFromLib } from '../../lib/navigationHeading';

export type AvatarGender = 'male' | 'female';

export type AvatarPose =
  | 'idle'
  | 'walk'
  | 'waveLeft'
  | 'waveRight'
  | 'celebrate';

const MARI = {
  idle: '/models/avatars/mari/idel.glb',
  walk: '/models/avatars/mari/walk.glb',
  wave: '/models/avatars/mari/wave.glb',
  celebrate: '/models/avatars/mari/sillyDance.glb',
} as const;

/** Head-to-toe height in world units. */
const TARGET_HEIGHT = 0.6;

/** Ground line the feet are pinned to. */
const FOOT_Y = -0.34;

/**
 * Idle / wave / celebrate:
 * yaw 0 faces the camera (+Z).
 */
const YAW_FACE_CAMERA = 0;

/**
 * Your walk GLB has its forward axis reversed compared with
 * the idle model.
 *
 * Keeping this correction separate from navigation yaw allows
 * the avatar to make complete 360° route turns.
 */
export const WALK_VISUAL_YAW_OFFSET_RAD = Math.PI;

/** How far she previously drifted across the lane. */
const LANE_SHIFT = 0;

/* -------------------------------------------------------------------------- */
/*                                TYPES                                       */
/* -------------------------------------------------------------------------- */

type ClipKey = 'idle' | 'walk' | 'wave' | 'celebrate';

/* -------------------------------------------------------------------------- */
/*                           ANIMATION HELPERS                                */
/* -------------------------------------------------------------------------- */

function poseToClip(pose: AvatarPose): ClipKey {
  if (pose === 'celebrate') return 'celebrate';

  if (pose === 'waveLeft' || pose === 'waveRight') {
    return 'wave';
  }

  if (pose === 'walk') {
    return 'walk';
  }

  return 'idle';
}

/**
 * Mixamo bakes root motion into Hips.position.
 * Remove that track so the avatar stays in place while
 * the navigation system controls direction.
 */
function toInPlaceClip(
  animations: unknown,
  label: string,
): THREE.AnimationClip | null {
  const clips = animations as THREE.AnimationClip[];

  if (!clips?.length) return null;

  const longest = clips.reduce((a, b) =>
    b.duration >= a.duration ? b : a,
  );

  const clip = longest.clone();

  clip.tracks = clip.tracks.filter(
    (track) => !track.name.endsWith('Hips.position'),
  );

  clip.name = label;

  return clip;
}

/* -------------------------------------------------------------------------- */
/*                         MODEL HELPERS                                      */
/* -------------------------------------------------------------------------- */

function findSkinnedMesh(
  root: THREE.Object3D,
): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;

  root.traverse((obj) => {
    if (!found && (obj as THREE.SkinnedMesh).isSkinnedMesh) {
      found = obj as THREE.SkinnedMesh;
    }
  });

  return found;
}

/* -------------------------------------------------------------------------- */
/*                              ROAD                                          */
/* -------------------------------------------------------------------------- */

function RoadStrip() {
  return (
    <group position={[0, FOOT_Y - 0.005, 0]}>
      {/* Road */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[0.85, 2.6]} />

        <meshStandardMaterial
          color="#3a3f46"
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>

      {/* Centre line */}
      <mesh
        position={[0, 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.035, 2.3]} />

        <meshStandardMaterial
          color="#e8c547"
          roughness={0.7}
        />
      </mesh>

      {/* Left road marking */}
      <mesh
        position={[-0.39, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.03, 2.45]} />

        <meshStandardMaterial
          color="#d8dde2"
          roughness={0.85}
        />
      </mesh>

      {/* Right road marking */}
      <mesh
        position={[0.39, 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[0.03, 2.45]} />

        <meshStandardMaterial
          color="#d8dde2"
          roughness={0.85}
        />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                         HUGE NAVIGATION ARROWS                             */
/* -------------------------------------------------------------------------- */

/**
 * Large 3D navigation arrows.
 *
 * IMPORTANT:
 * These do NOT use THREE.Shape / ShapeGeometry.
 * This avoids the duplicate-three type error you encountered.
 *
 * The arrows are made from:
 *   - boxGeometry = shaft
 *   - coneGeometry = arrow head
 *
 * They inherit the avatar's navigation rotation.
 */
function NavigationArrows({
  pose,
}: {
  pose: AvatarPose;
}) {
  const arrows = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!arrows.current) return;

    /*
     * Keep the arrow aligned with the avatar's
     * navigation direction.
     */
    arrows.current.rotation.y =
      pose === 'walk'
        ? WALK_VISUAL_YAW_OFFSET_RAD
        : 0;

    /*
     * Small floating animation.
     */
    const time = performance.now() * 0.003;

    arrows.current.position.y =
      Math.sin(time) * 0.025;
  });

  /*
   * Keep arrows visible whenever the guide is active.
   */
  if (
    pose !== 'walk' &&
    pose !== 'idle'
  ) {
    return null;
  }

  return (
    <group
      ref={arrows as never}
      position={[0, 0.05, 0.9]}
      renderOrder={1000}
    >
      {/* ============================================================ */}
      {/* MAIN HUGE ARROW                                              */}
      {/* ============================================================ */}

      <group
        position={[0, 0, 0]}
        scale={[1.05, 1.05, 1.05]}
      >
        {/* Shaft */}
        <mesh
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1001}
        >
          <boxGeometry args={[0.18, 0.7, 0.06]} />

          <meshBasicMaterial
            color="#00ff66"
            transparent={false}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        {/* Arrow head */}
        <mesh
          position={[0, 0, 0.58]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1002}
        >
          <coneGeometry args={[0.32, 0.5, 3]} />

          <meshBasicMaterial
            color="#00ff66"
            transparent={false}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* ============================================================ */}
      {/* SECOND ARROW                                                  */}
      {/* ============================================================ */}

      <group
        position={[0, 0, -0.75]}
        scale={[0.65, 0.65, 0.65]}
      >
        <mesh
          position={[0, 0, 0.15]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1001}
        >
          <boxGeometry
            args={[0.2, 0.75, 0.06]}
          />

          <meshBasicMaterial
            color="#00ff66"
            transparent={false}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>

        <mesh
          position={[0, 0, 0.52]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1002}
        >
          <coneGeometry
            args={[0.38, 0.58, 3]}
          />

          <meshBasicMaterial
            color="#00ff66"
            transparent={false}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                             CAMERA                                         */
/* -------------------------------------------------------------------------- */

function CameraRig() {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    camera.position.set(
      0,
      0.42,
      3.1,
    );

    camera.lookAt(
      0,
      -0.05,
      0,
    );

    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

/* -------------------------------------------------------------------------- */
/*                              MARI GUIDE                                    */
/* -------------------------------------------------------------------------- */

function MariGuide({
  pose,
  pathYawDeg,
}: {
  pose: AvatarPose;
  pathYawDeg: number;
}) {
  const fit = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const stage = useRef<THREE.Group>(null);

  const fitted = useRef(false);

  /*
   * Current smoothed navigation yaw.
   *
   * This is deliberately NOT clamped to ±85°.
   * It can represent a complete 360° rotation.
   */
  const yaw = useRef(0);

  const lateral = useRef(0);

  /* ---------------------------------------------------------------------- */
  /*                           LOAD MODELS                                  */
  /* ---------------------------------------------------------------------- */

  const idleGltf = useGLTF(MARI.idle);
  const walkGltf = useGLTF(MARI.walk);
  const waveGltf = useGLTF(MARI.wave);
  const danceGltf = useGLTF(MARI.celebrate);

  /* ---------------------------------------------------------------------- */
  /*                           CLONE MODEL                                  */
  /* ---------------------------------------------------------------------- */

  const model = useMemo(() => {
    const cloned = cloneSkeleton(
      idleGltf.scene as unknown as THREE.Object3D,
    ) as THREE.Group;

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

  /* ---------------------------------------------------------------------- */
  /*                           ANIMATIONS                                   */
  /* ---------------------------------------------------------------------- */

  const clips = useMemo(() => {
    const list = [
      toInPlaceClip(
        idleGltf.animations,
        'idle',
      ),

      toInPlaceClip(
        walkGltf.animations,
        'walk',
      ),

      toInPlaceClip(
        waveGltf.animations,
        'wave',
      ),

      toInPlaceClip(
        danceGltf.animations,
        'celebrate',
      ),
    ];

    return list.filter(
      (
        clip,
      ): clip is THREE.AnimationClip =>
        clip !== null,
    );
  }, [
    idleGltf.animations,
    walkGltf.animations,
    waveGltf.animations,
    danceGltf.animations,
  ]);

  const { actions } = useAnimations(
    clips as never,
    inner as never,
  );

  const clipKey = poseToClip(pose);

  useEffect(() => {
    const next =
      actions[clipKey] ??
      actions.idle;

    if (!next) return;

    /*
     * Stop all other animations so they don't fight
     * with the selected animation.
     */
    Object.entries(actions).forEach(
      ([name, action]) => {
        if (
          action &&
          name !== next.getClip().name
        ) {
          action.fadeOut(0.25);
        }
      },
    );

    next
      .reset()
      .setLoop(
        THREE.LoopRepeat,
        Infinity,
      )
      .setEffectiveWeight(1)
      .fadeIn(0.25)
      .play();
  }, [
    actions,
    clipKey,
  ]);

  /* ---------------------------------------------------------------------- */
  /*                     ROTATION + FITTING                                 */
  /* ---------------------------------------------------------------------- */

  useFrame((_, delta) => {
    /*
     * ================================================================
     * FULL 360° NAVIGATION ROTATION
     * ================================================================
     *
     * We intentionally DO NOT do:
     *
     * THREE.MathUtils.clamp(pathYawDeg, -85, 85)
     *
     * because that prevents U-turns.
     */

    const targetYaw =
      -THREE.MathUtils.degToRad(
        pathYawDeg,
      );

    /*
     * Calculate shortest angular difference.
     *
     * Example:
     *
     * current = 179°
     * target  = -179°
     *
     * Difference becomes +2°, rather than -358°.
     */
    const yawDelta =
      THREE.MathUtils.euclideanModulo(
        targetYaw -
          yaw.current +
          Math.PI,
        Math.PI * 2,
      ) - Math.PI;

    const desiredYaw =
      yaw.current + yawDelta;

    /*
     * Smooth turning.
     *
     * Increase 12 → faster turning.
     * Decrease 12 → slower turning.
     */
    yaw.current =
      THREE.MathUtils.damp(
        yaw.current,
        desiredYaw,
        12,
        delta,
      );

    /*
     * Rotate the entire inner guide.
     *
     * The navigation arrows are inside this group,
     * so they automatically receive exactly the same
     * route rotation.
     */
    if (inner.current) {
      inner.current.rotation.set(
        0,
        yaw.current,
        0,
      );
    }

    /*
     * No sideways lane movement.
     *
     * The avatar stays centred while turning.
     */
    lateral.current =
      THREE.MathUtils.damp(
        lateral.current,
        LANE_SHIFT,
        8,
        delta,
      );

    if (stage.current) {
      stage.current.position.x =
        lateral.current;
    }

    /* ------------------------------------------------------------------ */
    /*                           MODEL FIT                                 */
    /* ------------------------------------------------------------------ */

    if (fitted.current) return;

    const group = fit.current;

    const skinned =
      inner.current
        ? findSkinnedMesh(
            inner.current,
          )
        : null;

    if (!group || !skinned) return;

    group.scale.setScalar(1);

    group.position.set(
      0,
      0,
      0,
    );

    group.updateMatrixWorld(
      true,
    );

    skinned.computeBoundingBox();

    const bounds =
      skinned.boundingBox;

    if (!bounds) return;

    /*
     * Measure in the fit group's own space
     * so ancestor transforms don't distort it.
     */
    const toFitSpace =
      new THREE.Matrix4()
        .copy(
          group.matrixWorld,
        )
        .invert()
        .multiply(
          skinned.matrixWorld,
        );

    const box =
      bounds
        .clone()
        .applyMatrix4(
          toFitSpace,
        );

    const height =
      box.max.y -
      box.min.y;

    if (
      !Number.isFinite(height) ||
      height < 1e-4
    ) {
      return;
    }

    const scale =
      TARGET_HEIGHT /
      height;

    if (
      !Number.isFinite(scale) ||
      scale <= 0
    ) {
      return;
    }

    group.scale.setScalar(
      scale,
    );

    group.position.set(
      -(
        (box.min.x +
          box.max.x) /
        2
      ) * scale,

      FOOT_Y -
        box.min.y *
          scale,

      -(
        (box.min.z +
          box.max.z) /
        2
      ) * scale,
    );

    group.updateMatrixWorld(
      true,
    );

    fitted.current = true;
  });

  /* ---------------------------------------------------------------------- */
  /*                              MODEL TREE                                */
  /* ---------------------------------------------------------------------- */

  return (
    <group
      ref={stage as never}
    >
      <RoadStrip />

      {/*
       * `inner` controls navigation rotation.
       *
       * Therefore:
       *
       * pathYawDeg
       *      ↓
       *   yaw.current
       *      ↓
       * inner.rotation.y
       *      ↓
       * avatar + arrows
       */}
      <group ref={inner as never}>
        <NavigationArrows
          pose={pose}
        />

        <group ref={fit as never}>
          {/*
           * The walk GLB needs its fixed π visual correction.
           *
           * This is separate from route navigation.
           */}
          <group
            rotation={[
              0,
              pose === 'walk'
                ? WALK_VISUAL_YAW_OFFSET_RAD
                : 0,
              0,
            ]}
          >
            <primitive
              object={model}
            />
          </group>
        </group>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*                              PRELOAD                                       */
/* -------------------------------------------------------------------------- */

useGLTF.preload(
  MARI.idle,
);

useGLTF.preload(
  MARI.walk,
);

useGLTF.preload(
  MARI.wave,
);

useGLTF.preload(
  MARI.celebrate,
);

/* -------------------------------------------------------------------------- */
/*                            FALLBACK                                        */
/* -------------------------------------------------------------------------- */

function GuideFallback() {
  return (
    <mesh
      position={[
        0,
        FOOT_Y +
          TARGET_HEIGHT / 2,
        0,
      ]}
    >
      <capsuleGeometry
        args={[
          0.09,
          0.36,
          4,
          12,
        ]}
      />

      <meshStandardMaterial
        color="#148a80"
      />
    </mesh>
  );
}

/* -------------------------------------------------------------------------- */
/*                         GUIDE VIEWPORT                                     */
/* -------------------------------------------------------------------------- */

export function GuideDollViewport({
  gender: _gender,
  pose,
  pathYawDeg = 0,
  className = '',
}: {
  gender: AvatarGender;
  pose: AvatarPose;

  /**
   * Relative path bearing in degrees.
   *
   * 0    = straight
   * +90  = right
   * -90  = left
   * ±180 = complete U-turn
   */
  pathYawDeg?: number;

  className?: string;
}) {
  /*
   * Gender is currently retained for the existing
   * component API. Your current model setup uses Mari.
   */
  void _gender;

  return (
    <div
      className={className}
    >
      <Canvas
        camera={{
          position: [
            0,
            0.42,
            3.1,
          ],
          fov: 30,
        }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference:
            'high-performance',
        }}
        style={{
          background:
            'transparent',
        }}
        dpr={[
          1,
          1.75,
        ]}
      >
        <CameraRig />

        <ambientLight
          intensity={0.75}
        />

        <directionalLight
          position={[
            2.5,
            4.5,
            3,
          ]}
          intensity={1.4}
        />

        <directionalLight
          position={[
            -2.5,
            2,
            -1.5,
          ]}
          intensity={0.45}
        />

        <hemisphereLight
          args={[
            '#f5f0ea',
            '#6b7c86',
            0.5,
          ]}
        />

        <Suspense
          fallback={
            <GuideFallback />
          }
        >
          <MariGuide
            pose={pose}
            pathYawDeg={
              pathYawDeg
            }
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                        NAVIGATION HELPERS                                  */
/* -------------------------------------------------------------------------- */

/**
 * Returns the avatar steering yaw in radians.
 *
 * Unlike the old implementation, this does NOT clamp
 * the bearing to ±85°, allowing full U-turns.
 */
export function dollSteeringYawRad(
  pose: AvatarPose,
  pathYawDeg: number,
): number {
  if (pose !== 'walk') {
    return YAW_FACE_CAMERA;
  }

  return -THREE.MathUtils.degToRad(
    pathYawDeg,
  );
}

/**
 * Combined steering + walk visual correction.
 */
export function dollEffectiveYawRad(
  pose: AvatarPose,
  pathYawDeg: number,
): number {
  const steering =
    dollSteeringYawRad(
      pose,
      pathYawDeg,
    );

  return pose === 'walk'
    ? steering +
        WALK_VISUAL_YAW_OFFSET_RAD
    : steering;
}

/* -------------------------------------------------------------------------- */
/*                        ROUTE POSE LOGIC                                    */
/* -------------------------------------------------------------------------- */

/**
 * Guide animation state:
 *
 * 1. Wave once at route start
 * 2. Walk for the journey
 * 3. Celebrate on arrival
 */
export function poseFromRouteContext(
  input: {
    instruction?: string;
    nextInstruction?: string;
    distanceToNextM?: number;
    arrived: boolean;
    waveWithinM?: number;
    atRouteStart?: boolean;

    /**
     * When false, doll idles instead
     * of walking.
     */
    isMoving?: boolean;
  },
): AvatarPose {
  const {
    instruction,
    arrived,
    atRouteStart = false,
    isMoving = true,
  } = input;

  if (arrived) {
    return 'celebrate';
  }

  if (
    instruction
      ?.toLowerCase()
      .includes('arrived')
  ) {
    return 'celebrate';
  }

  if (atRouteStart) {
    return 'waveRight';
  }

  if (!isMoving) {
    return 'idle';
  }

  return 'walk';
}

/** @deprecated use poseFromRouteContext */
export function poseFromInstruction(
  instruction: string | undefined,
  arrived: boolean,
): AvatarPose {
  return poseFromRouteContext({
    instruction,
    arrived,
  });
}

/* -------------------------------------------------------------------------- */
/*                        BEARING HELPERS                                     */
/* -------------------------------------------------------------------------- */

/**
 * Normalize compass delta into -180…180.
 */
export function relativeBearingDeg(
  targetBearing: number,
  heading: number | null,
): number {
  if (heading == null) {
    return 0;
  }

  return relativeBearingDegFromLib(
    targetBearing,
    heading,
  );
}

function isTurnInstruction(
  instruction: string | undefined,
): boolean {
  if (!instruction) {
    return false;
  }

  const lower =
    instruction.toLowerCase();

  return (
    lower.includes('left') ||
    lower.includes('right') ||
    lower.includes('u-turn')
  );
}

/**
 * Bearing the guide should face.
 *
 * This is retained for other navigation UI.
 *
 * NOTE:
 * The avatar itself should use targetBearing /
 * dollYawDeg directly if you want the avatar to
 * follow the actual route direction exactly.
 */
export function guideFacingBearing(
  input: {
    currentBearing?: number;
    nextBearing?: number;
    nextInstruction?: string;
    distanceToNextM?: number;
    turnWithinM?: number;
  },
): number {
  const {
    currentBearing = 0,
    nextBearing,
    nextInstruction,
    distanceToNextM = Infinity,
    turnWithinM = 28,
  } = input;

  if (
    nextBearing != null &&
    isTurnInstruction(
      nextInstruction,
    ) &&
    distanceToNextM <=
      turnWithinM
  ) {
    const t =
      1 -
      Math.min(
        1,
        distanceToNextM /
          turnWithinM,
      );

    const delta =
      ((nextBearing -
        currentBearing +
        540) %
        360) -
      180;

    return (
      currentBearing +
      delta * t +
      360
    ) % 360;
  }

  return currentBearing;
}