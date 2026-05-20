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

  it('aplica veredicto FLAGGED cuando el provider lo devuelve', async () => {
    moderationMock.moderate.mockResolvedValueOnce({
      status: AiModerationStatus.FLAGGED,
      modelRef: 'aws:rekognition:v1',
      reason: 'explicit',
    });
    const processor = makeProcessor();
    await processor.process(
      makeJob({
        itemId: 'item-flagged',
        photoFileKeys: [],
        text: 'texto',
      }),
    );
    expect(repoMock.applyAiModerationVerdict).toHaveBeenCalledWith(
      expect.objectContaining({
        aiModerationStatus: AiModerationStatus.FLAGGED,
        reason: 'explicit',
      }),
    );
  });

  it('fail-closed: llama applyAiModerationVerdict con FLAGGED si el provider lanza', async () => {
    moderationMock.moderate.mockRejectedValueOnce(new Error('provider down'));
    const processor = makeProcessor();

    await processor.process(
      makeJob({
        itemId: 'item-2',
        photoFileKeys: [],
        text: 'texto',
      }),
    );

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

  it('fail-closed con error no-Error del provider', async () => {
    moderationMock.moderate.mockRejectedValueOnce('provider-string');
    const processor = makeProcessor();
    await processor.process(
      makeJob({ itemId: 'item-str', photoFileKeys: [], text: 't' }),
    );
    expect(repoMock.applyAiModerationVerdict).toHaveBeenCalled();
  });

  it('fail-closed: loguea error no-Error si applyAiModerationVerdict falla', async () => {
    moderationMock.moderate.mockRejectedValueOnce(new Error('provider down'));
    repoMock.applyAiModerationVerdict.mockRejectedValueOnce('db-string-fail');
    const processor = makeProcessor();
    await expect(
      processor.process(
        makeJob({ itemId: 'item-db-str', photoFileKeys: [], text: 't' }),
      ),
    ).rejects.toBe('db-string-fail');
  });

  it('fail-closed: loguea error si applyAiModerationVerdict falla tras provider error', async () => {
    moderationMock.moderate.mockRejectedValueOnce(new Error('provider down'));
    repoMock.applyAiModerationVerdict.mockRejectedValueOnce(
      new Error('db write failed'),
    );
    const processor = makeProcessor();

    await expect(
      processor.process(
        makeJob({
          itemId: 'item-fail-write',
          photoFileKeys: [],
          text: 'texto',
        }),
      ),
    ).rejects.toThrow('db write failed');
  });

  it('omite foto si downloadObject falla con error no-Error', async () => {
    storageMock.downloadObject.mockRejectedValueOnce('r2-string');
    const processor = makeProcessor();
    await processor.process(
      makeJob({
        itemId: 'item-5',
        photoFileKeys: ['photos/bad.jpg'],
        text: 'texto',
      }),
    );
    expect(moderationMock.moderate).toHaveBeenCalled();
  });

  it('omite foto si downloadObject falla', async () => {
    storageMock.downloadObject
      .mockRejectedValueOnce(new Error('r2 timeout'))
      .mockResolvedValueOnce(Buffer.from('ok'));
    const processor = makeProcessor();

    await processor.process(
      makeJob({
        itemId: 'item-4',
        photoFileKeys: ['photos/bad.jpg', 'photos/good.jpg'],
        text: 'texto',
      }),
    );

    expect(moderationMock.moderate).toHaveBeenCalled();
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
