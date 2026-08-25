import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return the current health status', () => {
      const timestamp = '2026-08-25T00:00:00.000Z';

      jest.useFakeTimers();
      jest.setSystemTime(new Date(timestamp));

      expect(controller.check()).toEqual({
        status: 'ok',
        timestamp,
      });
    });
  });
});
