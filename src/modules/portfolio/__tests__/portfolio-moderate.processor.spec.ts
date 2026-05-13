import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AiModerationStatus, ModerationTransitionType } from '@prisma/client';
import {
  PortfolioModerateProcessor,
  PORTFOLIO_MODERATE_JOB,
  type PortfolioModerateJobData,
} from '../queues/portfolio-moderate.processor';

const repoMock = {
  applyAiModerationVerdict: vi.fn().mockResolvedValue({ id: 'item-1' }),
};

const moderationMock = {
  moderate: vi.fn().mockResolvedValue({
    status: AiModerationStatus.OK,
    modelRef: 'aws:rekognition:v1',
  }),
};

const storageMock = {
  downloadObject: vi.fn().mockResolvedValue(Buffer.from('image-bytes')),
};

const aiCfg = { policyVersion: '1.0.0' };

function makeProcessor() {
  return new PortfolioModerateProcessor(
    repoMock as never,
    moderationMock,
    storageMock as never,
    aiCfg as never,
  );
}

function makeJob(data: PortfolioModerateJobData) {
  return { name: PORTFOLIO_MODERATE_JOB, data } as never;
}

describe('PortfolioModerateProcessor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('procesa un job OK y llama applyAiModerationVerdict con PUBLISHED', async () => {
    const processor = makeProcessor();
    await processor.process(
      makeJob({
        itemId: 'item-1',
        photoFileKeys: ['photos/img1.jpg'],
        text: 'Reforma de baño',
      }),
    );

    expect(moderationMock.moderate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Reforma de baño',
        photoFileKeys: ['photos/img1.jpg'],
      }),
    );
    expect(repoMock.applyAiModerationVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-1',
        aiModerationStatus: AiModerationStatus.OK,
        modelRef: 'aws:rekognition:v1',
        transitionType: ModerationTransitionType.INITIAL,
        policyVersion: '1.0.0',
      }),
    );
  });

  it('fail-closed: llama applyAiModerationVerdict con FLAGGED si el provider lanza', async () => {
    moderationMock.moderate.mockRejectedValueOnce(new Error('provider down'));
    const processor = makeProcessor();

    await expect(
      processor.process(
        makeJob({
          itemId: 'item-2',
          photoFileKeys: [],
          text: 'texto',
        }),
      ),
    ).rejects.toThrow('provider down');

    expect(repoMock.applyAiModerationVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'item-2',
        aiModerationStatus: AiModerationStatus.FLAGGED,
        modelRef: 'ai:error:fail-closed',
        errorCode: 'AI_PROVIDER_ERROR',
      }),
    );
  });

  it('ignora jobs con nombre desconocido', async () => {
    const processor = makeProcessor();
    const job = { name: 'unknown-job', data: {} } as never;
    await processor.process(job);

    expect(repoMock.applyAiModerationVerdict).not.toHaveBeenCalled();
  });

  it('descarga buffers de imágenes de R2', async () => {
    const processor = makeProcessor();
    await processor.process(
      makeJob({
        itemId: 'item-3',
        photoFileKeys: ['photos/a.jpg', 'photos/b.jpg'],
        text: 'texto',
      }),
    );

    expect(storageMock.downloadObject).toHaveBeenCalledTimes(2);
    expect(storageMock.downloadObject).toHaveBeenCalledWith('photos/a.jpg');
    expect(storageMock.downloadObject).toHaveBeenCalledWith('photos/b.jpg');
  });
});
