import {NativeModules, Platform, requireNativeComponent, type ViewProps} from 'react-native';
import type {ArMeasureEvent, CampusARMeasureNativeCommands} from './types';

type NativeViewProps = ViewProps & {
  onMeasureEvent?: (event: {nativeEvent: ArMeasureEvent}) => void;
};

export const CampusARMeasureView =
  requireNativeComponent<NativeViewProps>('CampusARMeasureView');

const LINKING_ERROR =
  `CampusAR native AR module is not linked. Rebuild the ${Platform.OS} app after installing native dependencies.`;

const NativeCampusARMeasure: CampusARMeasureNativeCommands | undefined =
  NativeModules.CampusARMeasureModule;

export function getCampusARMeasureModule(): CampusARMeasureNativeCommands {
  if (!NativeCampusARMeasure) {
    throw new Error(LINKING_ERROR);
  }
  return NativeCampusARMeasure;
}

export function isNativeArSupported(): boolean {
  return Boolean(NativeCampusARMeasure);
}
