import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_COMPANY_PROFILE, SINGLETON_COMPANY_ID } from '../company/company.constants';
import { OnboardingState } from './entities/onboarding-state.entity';
import { TourId } from './onboarding.constants';

// Same "PATCH can legitimately be the first write" reasoning as
// CompanyRepository: onboarding state can be touched before any Company
// profile GET/PATCH ever happens, so creating it here needs the same
// required-field defaults, not just the two tour columns.
const DEFAULT_STATE = {
  id: SINGLETON_COMPANY_ID,
  ...DEFAULT_COMPANY_PROFILE,
  tourEnabled: true,
  completedTours: [] as string[],
};

function toState(row: { tourEnabled: boolean; completedTours: string[] }): OnboardingState {
  return { tourEnabled: row.tourEnabled, completedTours: row.completedTours as TourId[] };
}

@Injectable()
export class OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getState(): Promise<OnboardingState> {
    // upsert (not findUnique + create), same reasoning as CompanyRepository:
    // the very first request the app ever receives can land here before the
    // Company row exists at all.
    const row = await this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: {},
      create: DEFAULT_STATE,
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  async setTourEnabled(tourEnabled: boolean): Promise<OnboardingState> {
    const row = await this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: { tourEnabled },
      create: { ...DEFAULT_STATE, tourEnabled },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  // Read-modify-write: completing an already-completed tour is a harmless
  // no-op rather than producing a duplicate entry in the array.
  async completeTour(tourId: TourId): Promise<OnboardingState> {
    const current = await this.getState();
    if (current.completedTours.includes(tourId)) {
      return current;
    }
    const row = await this.prisma.company.update({
      where: { id: SINGLETON_COMPANY_ID },
      data: { completedTours: [...current.completedTours, tourId] },
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }

  async resetTours(): Promise<OnboardingState> {
    const row = await this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: { completedTours: [] },
      create: DEFAULT_STATE,
      select: { tourEnabled: true, completedTours: true },
    });
    return toState(row);
  }
}
