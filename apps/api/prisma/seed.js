"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const argon2 = __importStar(require("argon2"));
const prisma = new client_1.PrismaClient();
async function main() {
    const company = await prisma.company.upsert({
        where: { taxId: '0573567001472' },
        update: {},
        create: {
            nameTh: 'ห้างหุ้นส่วนจำกัด โซลูชั่น เนกซ์เจน',
            nameEn: 'Solutions Nextgen Limited Partnership',
            taxId: '0573567001472',
            address: '468/449 หมู่ที่ 3 ตำบลบ้านดู่ อำเภอเมืองเชียงราย จังหวัดเชียงราย 57100',
            phone: '081-277-1948',
            email: 'contact@solutionsnextgen.co.th',
            brandShort: 'SN',
            tagline: 'นวัตกรรม การศึกษา การรักษา',
            registeredAt: new Date('2024-05-09T00:00:00+07:00'),
            vatEffectiveDate: new Date('2024-07-08T00:00:00+07:00'),
            capital: 1_000_000,
        },
    });
    const existingVat = await prisma.companyVatStatus.findFirst({
        where: { companyId: company.id, effectiveFrom: new Date('2024-07-08T00:00:00+07:00') },
    });
    if (!existingVat) {
        await prisma.companyVatStatus.create({
            data: {
                companyId: company.id,
                status: 'REGISTERED',
                effectiveFrom: new Date('2024-07-08T00:00:00+07:00'),
                reason: 'Initial VAT registration',
            },
        });
    }
    const ownerHash = await argon2.hash('owner123!');
    const adminHash = await argon2.hash('admin123!');
    await prisma.user.upsert({
        where: { email: 'owner@solutionsnextgen.co.th' },
        update: {},
        create: {
            companyId: company.id,
            email: 'owner@solutionsnextgen.co.th',
            passwordHash: ownerHash,
            fullName: 'นางสาววุฒิพร สอนนวล',
            initial: 'วพ',
            role: 'OWNER',
        },
    });
    await prisma.user.upsert({
        where: { email: 'admin@solutionsnextgen.co.th' },
        update: {},
        create: {
            companyId: company.id,
            email: 'admin@solutionsnextgen.co.th',
            passwordHash: adminHash,
            fullName: 'ผู้ดูแลระบบ',
            initial: 'AD',
            role: 'ADMIN',
        },
    });
    console.log('Seed complete.');
    console.log('  OWNER login: owner@solutionsnextgen.co.th / owner123!');
    console.log('  ADMIN login: admin@solutionsnextgen.co.th / admin123!');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
