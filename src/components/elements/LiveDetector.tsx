import React, { useState } from 'react';

import CameraStream from '../shared/CameraStream';
import useWindowSize from '../../hooks/useWindowSize';
import useGraphModel from '../../hooks/useGraphModel';
import { LINKS_DETECTOR_MODEL_URL } from '../../constants/models';
import Notification, { NotificationLevel } from '../shared/Notification';
import useLogger from '../../hooks/useLogger';
import ProgressBar from '../shared/ProgressBar';
import { DetectionBox, graphModelExecute } from '../../utils/graphModelExecute';
import DetectionBoxes from './DetectionBoxes';
import { isDebugMode } from '../../constants/debugging';

function LiveDetector(): React.ReactElement | null {
  const logger = useLogger({ context: 'LiveDetector' });
  const [boxes, setBoxes] = useState<DetectionBox[] | null>(null);
  const windowSize = useWindowSize();
  const {
    model,
    error: modelError,
    loadingProgress: modelLoadingProgress,
  } = useGraphModel({
    modelURL: LINKS_DETECTOR_MODEL_URL,
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
    const t0 = Date.now();

    const predictions: DetectionBox[] | null = await graphModelExecute({ model, video });

    const executionTimeMs = Date.now() - t0;
    const executionTimeS = (executionTimeMs / 1000).toFixed(2);

    setBoxes(predictions);

    logger.logDebug('onFrame', { executionTimeS });
  };

  const canvasBoxes = boxes && isDebugMode() ? (
    <div style={{ marginTop: `-${videoSize}px` }}>
      <DetectionBoxes
        boxes={boxes}
        canvasWidth={videoSize}
        canvasHeight={videoSize}
      />
    </div>
  ) : null;

  return (
    <div>
      <CameraStream
        onFrame={onFrame}
        width={videoSize}
        height={videoSize}
      />
      { canvasBoxes }
    </div>
  );
}

export default LiveDetector;
