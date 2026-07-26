import { Injectable, NotFoundException } from '@nestjs/common';
import { PushPlatform } from '../../generated/prisma/enums';
import { PushDeviceList, PushDeviceSummary } from './entities/push-device.entity';
import { PushDeviceRow, PushNotificationRepository } from './push-notification.repository';
import { PushSenderService } from './push-sender.service';

const PAGE_SIZE = 50;

function toSummary(row: PushDeviceRow): PushDeviceSummary {
  return {
    id: row.id,
    platform: row.platform,
    token: row.token,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    userEmail: row.user.email,
    companyName: row.user.company.name,
  };
}

@Injectable()
export class PushNotificationService {
  constructor(
    private readonly repository: PushNotificationRepository,
    private readonly sender: PushSenderService,
  ) {}

  registerDevice(userId: string, platform: PushPlatform, token: string): Promise<void> {
    return this.repository.upsertDevice(userId, platform, token);
  }

  unregisterDevice(userId: string, token: string): Promise<void> {
    return this.repository.deleteByToken(userId, token);
  }

  async listForAdmin(search: string | undefined, page: number): Promise<PushDeviceList> {
    const { rows, total } = await this.repository.listForAdmin(search, page);
    return {
      devices: rows.map(toSummary),
      total,
      page: Math.max(1, page),
      pageSize: PAGE_SIZE,
    };
  }

  async sendTest(deviceId: string): Promise<void> {
    const device = await this.repository.findById(deviceId);
    if (!device) {
      throw new NotFoundException('Appareil introuvable');
    }
    await this.sender.send([device.token], {
      title: 'FactureLe',
      body: 'Ceci est une notification de test envoyée depuis le tableau de bord admin.',
    });
  }
}
