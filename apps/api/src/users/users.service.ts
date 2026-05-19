import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { Role } from '@hj/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async listByCompany(companyId: string) {
    const users = await this.prisma.user.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
    return users.map((u) => this.toDto(u));
  }

  async create(companyId: string, currentUserRole: Role, dto: CreateUserDto) {
    if (currentUserRole !== 'OWNER' && dto.role === 'OWNER') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CANNOT_CREATE_OWNER',
        message: 'ผู้ดูแลระบบ (ADMIN) ไม่สามารถสร้างบัญชีเจ้าของกิจการ (OWNER) ได้',
      });
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'อีเมลนี้ถูกใช้แล้ว',
      });
    }
    const passwordHash = await argon2.hash(dto.password);
    const created = await this.prisma.user.create({
      data: {
        companyId,
        email: dto.email.trim().toLowerCase(),
        passwordHash,
        fullName: dto.fullName.trim(),
        initial: dto.initial?.trim() || null,
        role: dto.role,
      },
    });
    return this.toDto(created);
  }

  async update(companyId: string, id: string, currentUserId: string, currentUserRole: Role, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, companyId } });
    if (!user) throw new NotFoundException('User not found');

    if (currentUserRole !== 'OWNER' && user.role === 'OWNER') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'CANNOT_EDIT_OWNER',
        message: 'ผู้ดูแลระบบ (ADMIN) ไม่สามารถแก้ไขบัญชีเจ้าของกิจการ (OWNER) ได้',
      });
    }

    // Refuse demoting / deactivating yourself — easy way to lose all admin access.
    if (id === currentUserId) {
      if (dto.role && dto.role !== user.role) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CANNOT_CHANGE_OWN_ROLE',
          message: 'ไม่อนุญาตให้เปลี่ยน role ของตัวเอง — แจ้งผู้ใช้คนอื่นที่มีสิทธิ์ดำเนินการแทน',
        });
      }
      if (dto.isActive === false) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CANNOT_DEACTIVATE_SELF',
          message: 'ไม่อนุญาตให้ปิดบัญชีของตัวเอง',
        });
      }
    }

    // Don't allow demoting the last OWNER — leaves the company with no top admin.
    if (
      user.role === 'OWNER' &&
      dto.role &&
      dto.role !== 'OWNER'
    ) {
      const ownerCount = await this.prisma.user.count({
        where: { companyId, role: 'OWNER', isActive: true },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'CANNOT_REMOVE_LAST_OWNER',
          message: 'ไม่สามารถลดสิทธิ์ OWNER คนสุดท้ายของบริษัทได้',
        });
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName != null) data.fullName = dto.fullName.trim();
    if (dto.initial !== undefined) data.initial = dto.initial?.trim() || null;
    if (dto.role) data.role = dto.role as Role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.password) data.passwordHash = await argon2.hash(dto.password);

    const updated = await this.prisma.user.update({ where: { id }, data });
    return this.toDto(updated);
  }

  private toDto(user: {
    id: string;
    companyId: string;
    email: string;
    fullName: string;
    initial: string | null;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      initial: user.initial,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
