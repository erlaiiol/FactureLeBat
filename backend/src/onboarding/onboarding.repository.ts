import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TourId } from './onboarding.constants';

function toState(row: { tourEnabled: boolean; completedTours: string[] }): OnboardingState {
  return { tourEnabled: row.tourEnabled, completedTours: row.completedTours as TourId[] };
}

@Injectable()
export class OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Phase 13: a Company row always exists by the time an authenticated
  // request reaches here — plain findUniqueOrThrow/update, no more
  // upsert-on-first-write (see CompanyRepository).
  async getState(companyId: string): Promise<OnboardingState> {
    const row = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  async setTourEnabled(companyId: string, tourEnabled: boolean): Promise<OnboardingState> {
    const row = await this.prisma.company.update({
      where: { id: companyId },
      data: { tourEnabled },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  // Read-modify-write: completing an already-completed tour is a harmless
  // no-op rather than producing a duplicate entry in the array.
  async completeTour(companyId: string, tourId: TourId): Promise<OnboardingState> {
    const current = await this.getState(companyId);
    if (current.completedTours.includes(tourId)) {
      return current;
    }
    const row = await this.prisma.company.update({
      where: { id: companyId },
      data: { completedTours: [...current.completedTours, tourId] },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  async resetTours(companyId: string): Promise<OnboardingState> {
    const row = await this.prisma.company.update({
      where: { id: companyId },
      data: { completedTours: [] },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }
}
