import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { validateTransition } from './validate-transition';

describe('validateTransition', () => {
  describe('happy paths (PRD §8 matrix)', () => {
    it('DRAFT → USER_CONFIRMED for OWNER (sales fast-path)', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'USER_CONFIRMED', role: 'OWNER' }),
      ).not.toThrow();
    });

    it('DRAFT → USER_CONFIRMED for ADMIN', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'USER_CONFIRMED', role: 'ADMIN' }),
      ).not.toThrow();
    });

    it('USER_CONFIRMED → ACCOUNTED for ACCOUNTANT', () => {
      expect(() =>
        validateTransition({ from: 'USER_CONFIRMED', to: 'ACCOUNTED', role: 'ACCOUNTANT' }),
      ).not.toThrow();
    });

    it('PENDING_ACCOUNTANT → ACCOUNTANT_APPROVED for ACCOUNTANT', () => {
      expect(() =>
        validateTransition({
          from: 'PENDING_ACCOUNTANT',
          to: 'ACCOUNTANT_APPROVED',
          role: 'ACCOUNTANT',
        }),
      ).not.toThrow();
    });

    it('ACCOUNTANT_APPROVED → LOCKED for OWNER', () => {
      expect(() =>
        validateTransition({ from: 'ACCOUNTANT_APPROVED', to: 'LOCKED', role: 'OWNER' }),
      ).not.toThrow();
    });

    it('AI_AGENT can do DRAFT → AI_EXTRACTED', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'AI_EXTRACTED', role: 'AI_AGENT' }),
      ).not.toThrow();
    });
  });

  describe('disallowed transitions (PRD §8)', () => {
    it('VOIDED is terminal — cannot leave', () => {
      expect(() =>
        validateTransition({ from: 'VOIDED', to: 'DRAFT', role: 'OWNER' }),
      ).toThrow(UnprocessableEntityException);
    });

    it('DRAFT → ACCOUNTED is not allowed (must go through USER_CONFIRMED)', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'ACCOUNTED', role: 'OWNER' }),
      ).toThrow(UnprocessableEntityException);
    });

    it('USER_CONFIRMED → DRAFT is not allowed (no rewind once confirmed)', () => {
      expect(() =>
        validateTransition({ from: 'USER_CONFIRMED', to: 'DRAFT', role: 'OWNER' }),
      ).toThrow(UnprocessableEntityException);
    });

    it('LOCKED can only transition to VOIDED', () => {
      expect(() =>
        validateTransition({ from: 'LOCKED', to: 'ACCOUNTED', role: 'OWNER' }),
      ).toThrow(UnprocessableEntityException);
    });
  });

  describe('role gating', () => {
    it('AI_AGENT cannot CONFIRM (PRD §6.5)', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'USER_CONFIRMED', role: 'AI_AGENT' }),
      ).toThrow(ForbiddenException);
    });

    it('AI_AGENT cannot VOID', () => {
      expect(() =>
        validateTransition({
          from: 'USER_CONFIRMED',
          to: 'VOIDED',
          role: 'AI_AGENT',
          reason: 'test',
        }),
      ).toThrow(ForbiddenException);
    });

    it('VIEWER cannot do any transition', () => {
      expect(() =>
        validateTransition({ from: 'DRAFT', to: 'USER_CONFIRMED', role: 'VIEWER' }),
      ).toThrow(ForbiddenException);
    });

    it('ADMIN cannot APPROVE (only ACCOUNTANT can)', () => {
      expect(() =>
        validateTransition({
          from: 'PENDING_ACCOUNTANT',
          to: 'ACCOUNTANT_APPROVED',
          role: 'ADMIN',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('VOID requires reason', () => {
    it('throws when reason missing', () => {
      expect(() =>
        validateTransition({ from: 'USER_CONFIRMED', to: 'VOIDED', role: 'OWNER' }),
      ).toThrow(UnprocessableEntityException);
    });

    it('throws when reason is empty string', () => {
      expect(() =>
        validateTransition({
          from: 'USER_CONFIRMED',
          to: 'VOIDED',
          role: 'OWNER',
          reason: '   ',
        }),
      ).toThrow(UnprocessableEntityException);
    });

    it('passes with reason of any non-empty trimmed string', () => {
      expect(() =>
        validateTransition({
          from: 'USER_CONFIRMED',
          to: 'VOIDED',
          role: 'OWNER',
          reason: 'ลูกค้ายกเลิก',
        }),
      ).not.toThrow();
    });
  });

  it('returns the rule object on success', () => {
    const rule = validateTransition({ from: 'DRAFT', to: 'USER_CONFIRMED', role: 'OWNER' });
    expect(rule.allowedRoles).toContain('OWNER');
    expect(rule.allowedRoles).toContain('ADMIN');
  });
});
