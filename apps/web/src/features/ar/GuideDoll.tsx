import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export type AvatarGender = 'male' | 'female';
export type AvatarPose = 'idle' | 'walk' | 'waveLeft' | 'waveRight' | 'celebrate';

const PALETTE = {
  male: {
    skin: '#c9956c',
    hair: '#2c2118',
    shirt: '#0f6b63',
    pants: '#2a353e',
    shoes: '#1a2228',
  },
  female: {
    skin: '#d4a574',
    hair: '#3d2415',
    shirt: '#148a80',
    pants: '#3d4b56',
    shoes: '#1a2228',
  },
} as const;

/** Smoothly approach a rotation target each frame. */
function approach(current: number, target: number, alpha = 0.18): number {
  return THREE.MathUtils.lerp(current, target, alpha);
}

function DollModel({ gender, pose }: { gender: AvatarGender; pose: AvatarPose }) {
  const root = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const leftUpperArm = useRef<THREE.Group>(null);
  const rightUpperArm = useRef<THREE.Group>(null);
  const leftForearm = useRef<THREE.Group>(null);
  const rightForearm = useRef<THREE.Group>(null);
  const leftThigh = useRef<THREE.Group>(null);
  const rightThigh = useRef<THREE.Group>(null);
  const leftShin = useRef<THREE.Group>(null);
  const rightShin = useRef<THREE.Group>(null);
  const colors = PALETTE[gender];

  const body = useMemo(() => {
    if (gender === 'female') {
      return {
        scale: 1.12,
        shoulder: 0.32,
        hip: 0.15,
        torso: [0.5, 0.68, 0.26] as [number, number, number],
        head: 0.21,
        armLen: 0.28,
        forearmLen: 0.26,
        thighLen: 0.34,
        shinLen: 0.32,
      };
    }
    return {
      scale: 1.18,
      shoulder: 0.36,
      hip: 0.16,
      torso: [0.56, 0.74, 0.3] as [number, number, number],
      head: 0.23,
      armLen: 0.3,
      forearmLen: 0.28,
      thighLen: 0.36,
      shinLen: 0.34,
    };
  }, [gender]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const rootObj = root.current;
    if (!rootObj) return;

    const LArm = leftUpperArm.current;
    const RArm = rightUpperArm.current;
    const LFore = leftForearm.current;
    const RFore = rightForearm.current;
    const LThigh = leftThigh.current;
    const RThigh = rightThigh.current;
    const LShin = leftShin.current;
    const RShin = rightShin.current;
    const torsoG = torso.current;
    if (!LArm || !RArm || !LFore || !RFore || !LThigh || !RThigh || !LShin || !RShin || !torsoG) {
      return;
    }

    if (pose === 'walk') {
      // Human gait: opposite arm/leg, ~1.7 steps/sec
      const phase = t * Math.PI * 3.4;
      const legSwing = Math.sin(phase) * 0.55;
      const armSwing = Math.sin(phase) * 0.42;
      const kneeBend = Math.max(0, -Math.sin(phase)) * 0.75;
      const kneeBendR = Math.max(0, Math.sin(phase)) * 0.75;
      const bob = Math.abs(Math.sin(phase)) * 0.05;
      const sway = Math.sin(phase) * 0.04;

      rootObj.position.y = approach(rootObj.position.y, -0.85 + bob, 0.35);
      rootObj.rotation.y = approach(rootObj.rotation.y, 0, 0.12);
      torsoG.rotation.z = approach(torsoG.rotation.z, sway, 0.2);
      torsoG.rotation.x = approach(torsoG.rotation.x, Math.sin(phase * 2) * 0.03, 0.2);

      // Legs (left forward when sin>0)
      LThigh.rotation.x = approach(LThigh.rotation.x, legSwing, 0.28);
      RThigh.rotation.x = approach(RThigh.rotation.x, -legSwing, 0.28);
      LShin.rotation.x = approach(LShin.rotation.x, kneeBend, 0.28);
      RShin.rotation.x = approach(RShin.rotation.x, kneeBendR, 0.28);

      // Arms opposite to legs
      LArm.rotation.x = approach(LArm.rotation.x, -armSwing, 0.28);
      RArm.rotation.x = approach(RArm.rotation.x, armSwing, 0.28);
      LArm.rotation.z = approach(LArm.rotation.z, 0.08, 0.15);
      RArm.rotation.z = approach(RArm.rotation.z, -0.08, 0.15);
      LFore.rotation.x = approach(LFore.rotation.x, 0.25 + Math.max(0, -armSwing) * 0.4, 0.25);
      RFore.rotation.x = approach(RFore.rotation.x, 0.25 + Math.max(0, armSwing) * 0.4, 0.25);
    } else if (pose === 'waveLeft' || pose === 'waveRight') {
      // Keep a light walk on the legs while waving the turn-side hand
      const phase = t * Math.PI * 2.6;
      const legSwing = Math.sin(phase) * 0.28;
      const wave = Math.sin(t * 10) * 0.55;
      const isLeft = pose === 'waveLeft';

      rootObj.position.y = approach(rootObj.position.y, -0.85 + Math.abs(Math.sin(phase)) * 0.03, 0.3);
      rootObj.rotation.y = approach(rootObj.rotation.y, isLeft ? 0.25 : -0.25, 0.12);
      torsoG.rotation.z = approach(torsoG.rotation.z, isLeft ? 0.08 : -0.08, 0.15);
      torsoG.rotation.x = approach(torsoG.rotation.x, 0, 0.15);

      LThigh.rotation.x = approach(LThigh.rotation.x, legSwing, 0.2);
      RThigh.rotation.x = approach(RThigh.rotation.x, -legSwing, 0.2);
      LShin.rotation.x = approach(LShin.rotation.x, Math.max(0, -Math.sin(phase)) * 0.4, 0.2);
      RShin.rotation.x = approach(RShin.rotation.x, Math.max(0, Math.sin(phase)) * 0.4, 0.2);

      if (isLeft) {
        // Left arm raised and waving
        LArm.rotation.x = approach(LArm.rotation.x, -2.35, 0.2);
        LArm.rotation.z = approach(LArm.rotation.z, 0.55 + wave * 0.35, 0.25);
        LFore.rotation.x = approach(LFore.rotation.x, -0.35 + wave * 0.4, 0.25);
        RArm.rotation.x = approach(RArm.rotation.x, 0.2, 0.15);
        RArm.rotation.z = approach(RArm.rotation.z, -0.1, 0.15);
        RFore.rotation.x = approach(RFore.rotation.x, 0.3, 0.15);
      } else {
        RArm.rotation.x = approach(RArm.rotation.x, -2.35, 0.2);
        RArm.rotation.z = approach(RArm.rotation.z, -0.55 + wave * 0.35, 0.25);
        RFore.rotation.x = approach(RFore.rotation.x, -0.35 + wave * 0.4, 0.25);
        LArm.rotation.x = approach(LArm.rotation.x, 0.2, 0.15);
        LArm.rotation.z = approach(LArm.rotation.z, 0.1, 0.15);
        LFore.rotation.x = approach(LFore.rotation.x, 0.3, 0.15);
      }
    } else if (pose === 'celebrate') {
      const bounce = Math.abs(Math.sin(t * 6)) * 0.14;
      rootObj.position.y = approach(rootObj.position.y, -0.85 + bounce, 0.35);
      rootObj.rotation.y = approach(rootObj.rotation.y, Math.sin(t * 2.2) * 0.4, 0.15);
      torsoG.rotation.z = approach(torsoG.rotation.z, 0, 0.15);
      torsoG.rotation.x = approach(torsoG.rotation.x, -0.08, 0.15);

      LArm.rotation.x = approach(LArm.rotation.x, -2.5 + Math.sin(t * 8) * 0.2, 0.25);
      RArm.rotation.x = approach(RArm.rotation.x, -2.5 + Math.cos(t * 8) * 0.2, 0.25);
      LArm.rotation.z = approach(LArm.rotation.z, 0.4, 0.15);
      RArm.rotation.z = approach(RArm.rotation.z, -0.4, 0.15);
      LFore.rotation.x = approach(LFore.rotation.x, -0.2, 0.15);
      RFore.rotation.x = approach(RFore.rotation.x, -0.2, 0.15);
      LThigh.rotation.x = approach(LThigh.rotation.x, 0.12, 0.15);
      RThigh.rotation.x = approach(RThigh.rotation.x, -0.12, 0.15);
      LShin.rotation.x = approach(LShin.rotation.x, 0.1, 0.15);
      RShin.rotation.x = approach(RShin.rotation.x, 0.1, 0.15);
    } else {
      // Idle breathing
      rootObj.position.y = approach(rootObj.position.y, -0.85 + Math.sin(t * 1.4) * 0.012, 0.15);
      rootObj.rotation.y = approach(rootObj.rotation.y, 0, 0.1);
      torsoG.rotation.z = approach(torsoG.rotation.z, 0, 0.1);
      torsoG.rotation.x = approach(torsoG.rotation.x, Math.sin(t * 1.4) * 0.02, 0.1);
      LArm.rotation.x = approach(LArm.rotation.x, 0.12, 0.1);
      RArm.rotation.x = approach(RArm.rotation.x, -0.12, 0.1);
      LArm.rotation.z = approach(LArm.rotation.z, 0.12, 0.1);
      RArm.rotation.z = approach(RArm.rotation.z, -0.12, 0.1);
      LFore.rotation.x = approach(LFore.rotation.x, 0.2, 0.1);
      RFore.rotation.x = approach(RFore.rotation.x, 0.2, 0.1);
      LThigh.rotation.x = approach(LThigh.rotation.x, 0.02, 0.1);
      RThigh.rotation.x = approach(RThigh.rotation.x, -0.02, 0.1);
      LShin.rotation.x = approach(LShin.rotation.x, 0.05, 0.1);
      RShin.rotation.x = approach(RShin.rotation.x, 0.05, 0.1);
    }
  });

  return (
    <group ref={root as never} position={[0, -0.85, 0]} scale={body.scale}>
      <group ref={torso as never}>
        <mesh position={[0, 0.62, 0]} castShadow>
          <boxGeometry args={body.torso} />
          <meshStandardMaterial color={colors.shirt} roughness={0.6} />
        </mesh>

        <mesh position={[0, 0.18, 0]} castShadow>
          <boxGeometry args={[0.52, 0.26, 0.28]} />
          <meshStandardMaterial color={colors.pants} roughness={0.7} />
        </mesh>

        <mesh position={[0, 1.15, 0]} castShadow>
          <sphereGeometry args={[body.head, 18, 18]} />
          <meshStandardMaterial color={colors.skin} roughness={0.5} />
        </mesh>

        {gender === 'female' ? (
          <>
            <mesh position={[0, 1.26, -0.02]} castShadow>
              <sphereGeometry args={[0.225, 16, 16]} />
              <meshStandardMaterial color={colors.hair} roughness={0.85} />
            </mesh>
            <mesh position={[0, 0.98, -0.12]} castShadow>
              <boxGeometry args={[0.34, 0.38, 0.12]} />
              <meshStandardMaterial color={colors.hair} roughness={0.85} />
            </mesh>
          </>
        ) : (
          <mesh position={[0, 1.3, 0]} castShadow>
            <boxGeometry args={[0.4, 0.11, 0.36]} />
            <meshStandardMaterial color={colors.hair} roughness={0.85} />
          </mesh>
        )}

        {/* Left arm chain */}
        <group ref={leftUpperArm as never} position={[-body.shoulder, 0.9, 0]}>
          <mesh position={[0, -body.armLen / 2, 0]} castShadow>
            <capsuleGeometry args={[0.07, body.armLen * 0.55, 4, 8]} />
            <meshStandardMaterial color={colors.skin} />
          </mesh>
          <group ref={leftForearm as never} position={[0, -body.armLen, 0]}>
            <mesh position={[0, -body.forearmLen / 2, 0]} castShadow>
              <capsuleGeometry args={[0.06, body.forearmLen * 0.55, 4, 8]} />
              <meshStandardMaterial color={colors.skin} />
            </mesh>
          </group>
        </group>

        {/* Right arm chain */}
        <group ref={rightUpperArm as never} position={[body.shoulder, 0.9, 0]}>
          <mesh position={[0, -body.armLen / 2, 0]} castShadow>
            <capsuleGeometry args={[0.07, body.armLen * 0.55, 4, 8]} />
            <meshStandardMaterial color={colors.skin} />
          </mesh>
          <group ref={rightForearm as never} position={[0, -body.armLen, 0]}>
            <mesh position={[0, -body.forearmLen / 2, 0]} castShadow>
              <capsuleGeometry args={[0.06, body.forearmLen * 0.55, 4, 8]} />
              <meshStandardMaterial color={colors.skin} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Left leg chain */}
      <group ref={leftThigh as never} position={[-body.hip, 0.08, 0]}>
        <mesh position={[0, -body.thighLen / 2, 0]} castShadow>
          <capsuleGeometry args={[0.09, body.thighLen * 0.55, 4, 8]} />
          <meshStandardMaterial color={colors.pants} />
        </mesh>
        <group ref={leftShin as never} position={[0, -body.thighLen, 0]}>
          <mesh position={[0, -body.shinLen / 2, 0]} castShadow>
            <capsuleGeometry args={[0.075, body.shinLen * 0.55, 4, 8]} />
            <meshStandardMaterial color={colors.pants} />
          </mesh>
          <mesh position={[0, -body.shinLen - 0.02, 0.05]} castShadow>
            <boxGeometry args={[0.16, 0.08, 0.26]} />
            <meshStandardMaterial color={colors.shoes} />
          </mesh>
        </group>
      </group>

      {/* Right leg chain */}
      <group ref={rightThigh as never} position={[body.hip, 0.08, 0]}>
        <mesh position={[0, -body.thighLen / 2, 0]} castShadow>
          <capsuleGeometry args={[0.09, body.thighLen * 0.55, 4, 8]} />
          <meshStandardMaterial color={colors.pants} />
        </mesh>
        <group ref={rightShin as never} position={[0, -body.thighLen, 0]}>
          <mesh position={[0, -body.shinLen / 2, 0]} castShadow>
            <capsuleGeometry args={[0.075, body.shinLen * 0.55, 4, 8]} />
            <meshStandardMaterial color={colors.pants} />
          </mesh>
          <mesh position={[0, -body.shinLen - 0.02, 0.05]} castShadow>
            <boxGeometry args={[0.16, 0.08, 0.26]} />
            <meshStandardMaterial color={colors.shoes} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export function GuideDollViewport({
  gender,
  pose,
  className = '',
}: {
  gender: AvatarGender;
  pose: AvatarPose;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 1.05, 2.55], fov: 36 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.9} />
        <directionalLight position={[2.2, 4, 2.5]} intensity={1.15} />
        <hemisphereLight args={['#f0f4f6', '#8a97a1', 0.35]} />
        <DollModel gender={gender} pose={pose} />
      </Canvas>
    </div>
  );
}

function turnSide(instruction: string | undefined): 'left' | 'right' | null {
  if (!instruction) return null;
  const lower = instruction.toLowerCase();
  if (lower.includes('left')) return 'left';
  if (lower.includes('right') || lower.includes('u-turn')) return 'right';
  return null;
}

/**
 * Pick doll pose from the current step and the upcoming step.
 * Waves the turn-side hand when a turn is imminent (within threshold meters).
 */
export function poseFromRouteContext(input: {
  instruction?: string;
  nextInstruction?: string;
  distanceToNextM?: number;
  arrived: boolean;
  waveWithinM?: number;
}): AvatarPose {
  const { instruction, nextInstruction, distanceToNextM = Infinity, arrived, waveWithinM = 28 } =
    input;
  if (arrived) return 'celebrate';
  if (instruction?.toLowerCase().includes('arrived')) return 'celebrate';

  const currentTurn = turnSide(instruction);
  if (currentTurn === 'left') return 'waveLeft';
  if (currentTurn === 'right') return 'waveRight';

  const upcoming = turnSide(nextInstruction);
  if (upcoming && distanceToNextM <= waveWithinM) {
    return upcoming === 'left' ? 'waveLeft' : 'waveRight';
  }

  return 'walk';
}

/** @deprecated use poseFromRouteContext */
export function poseFromInstruction(instruction: string | undefined, arrived: boolean): AvatarPose {
  return poseFromRouteContext({ instruction, arrived });
}
