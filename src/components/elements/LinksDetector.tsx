import React, { CSSProperties, useRef, useState } from 'react';

import CameraStream from '../shared/CameraStream';
import useWindowSize from '../../hooks/useWindowSize';
import useGraphModel from '../../hooks/useGraphModel';
import { DETECTION_CONFIG } from '../../configs/detectionConfig';
import Notification, { NotificationLevel } from '../shared/Notification';
import useLogger from '../../hooks/useLogger';
import ProgressBar from '../shared/ProgressBar';
import { DetectionBox, graphModelExecute } from '../../utils/graphModel';
import BoxesCanvas from './BoxesCanvas';
import { isDebugMode } from '../../constants/debug';
import ErrorBoundary from '../shared/ErrorBoundary';
import PixelsCanvas from './PixelsCanvas';
import {
  brightnessFilter,
  FilterFunc,
  greyscaleFilter,
  Pixels,
  preprocessPixels,
  contrastFilter,
} from '../../utils/image';
import { newProfiler, Profiler } from '../../utils/profiler';

const userVideoBrightness = 1 + DETECTION_CONFIG.imagePreprocessing.ui.brightness;
const userVideoContrast = 1 + DETECTION_CONFIG.imagePreprocessing.ui.contrast;

const modelVideoBrightness = DETECTION_CONFIG.imagePreprocessing.model.brightness;
const modelVideoContrast = DETECTION_CONFIG.imagePreprocessing.model.contrast;

const videoStyle: CSSProperties = DETECTION_CONFIG.imagePreprocessing.ui.enabled ? {
  filter: `brightness(${userVideoBrightness}) contrast(${userVideoContrast}) grayscale(1)`,
} : {};

function LinksDetector(): React.ReactElement | null {
  const preprocessingProfiler = useRef<Profiler>(newProfiler());
  const inferenceProfiler = useRef<Profiler>(newProfiler());
  const onFrameProfiler = useRef<Profiler>(newProfiler());

  const [pixels, setPixels] = useState<Pixels | null>(null);
  const logger = useLogger({ context: 'LiveDetector' });
  const [boxes, setBoxes] = useState<DetectionBox[] | null>(null);
  const windowSize = useWindowSize();
  const {
    model,
    error: modelError,
    loadingProgress: modelLoadingProgress,
  } = useGraphModel({
    modelURL: DETECTION_CONFIG.modelLoading.linksDetectorModelURL,
    warmup: true,
  });

  if (!model) {
    if (modelError) {
      return (
        <Notification level={NotificationLevel.DANGER}>
          {modelError}
        </Notification>
      );
    }
    const loadingText = modelLoadingProgress === 1 ? 'Warming up link detector' : 'Loading link detector';
    return (
      <ProgressBar progress={modelLoadingProgress * 100} text={loadingText} />
    );
  }

  if (!windowSize || !windowSize.width || !windowSize.height) {
    return <ProgressBar text="Detecting the window size" />;
  }

  const videoSize: number = Math.min(windowSize.width, windowSize.height);

  const onFrame = async (video: HTMLVideoElement): Promise<void> => {
    onFrameProfiler.current.start();

    // Image preprocessing.
    const filters: FilterFunc[] = DETECTION_CONFIG.imagePreprocessing.model.enabled ? [
      brightnessFilter(modelVideoBrightness),
      contrastFilter(modelVideoContrast),
      greyscaleFilter(),
    ] : [];
    preprocessingProfiler.current.start();
    const processedPixels = preprocessPixels(video, filters);
    setPixels(processedPixels);
    const imageProcessingTime = preprocessingProfiler.current.stop();

    // Model execution.
    inferenceProfiler.current.start();
    const predictions: DetectionBox[] | null = await graphModelExecute({
      model,
      pixels: processedPixels,
      maxBoxesNum: DETECTION_CONFIG.httpsDetection.maxBoxesNum,
      scoreThreshold: DETECTION_CONFIG.httpsDetection.scoreThreshold,
      iouThreshold: DETECTION_CONFIG.httpsDetection.IOUThreshold,
    });
    const modelExecutionTime = inferenceProfiler.current.stop();
    setBoxes(predictions);

    const onFrameTime = onFrameProfiler.current.stop();

    logger.logDebug('onFrame', {
      procT: imageProcessingTime,
      avgProcT: preprocessingProfiler.current.avg(),
      execT: modelExecutionTime,
      avgExecT: inferenceProfiler.current.avg(),
      onFrameT: onFrameTime,
      avgFps: onFrameProfiler.current.fps(),
    });
  };

  const canvasContainerStyles: CSSProperties = {
    marginTop: `-${videoSize}px`,
    position: 'relative',
  };

  const boxesCanvas = boxes && isDebugMode() ? (
    <ErrorBoundary>
      <div style={canvasContainerStyles}>
        <BoxesCanvas
          boxes={boxes}
          width={videoSize}
          height={videoSize}
        />
      </div>
    </ErrorBoundary>
  ) : null;

  const imageCanvas = isDebugMode() ? (
    <ErrorBoundary>
      <div style={canvasContainerStyles}>
        <PixelsCanvas
          pixels={pixels}
          width={videoSize}
          height={videoSize}
        />
      </div>
    </ErrorBoundary>
  ) : null;

  return (
    <div>
      <ErrorBoundary>
        <CameraStream
          onFrame={onFrame}
          width={videoSize}
          height={videoSize}
          videoStyle={videoStyle}
          idealFrameRate={DETECTION_CONFIG.videoStreaming.idealFPS}
        />
      </ErrorBoundary>
      { imageCanvas }
      { boxesCanvas }
    </div>
  );
}

export default LinksDetector;