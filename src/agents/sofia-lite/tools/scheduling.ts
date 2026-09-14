import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { PocLog } from '../../../adk/poc-log.js';

export type Sede = 'sucre' | 'cochabamba';

type Slot = {
  slot_id: string;
  date: string;
  time: string;
  sede: Sede;
};

/** Stable fake agenda for the POC. */
const DAYS = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'] as const;
const HOURS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] as const;

const bookings = new Map<string, Slot & { customer_name: string; service_name: string }>();

function slotsFor(sede: Sede, date: string): Slot[] {
  return HOURS.map((time, index) => ({
    slot_id: `${sede}_${date}_${time.replace(':', '')}`,
    date,
    time,
    sede,
  }));
}

export function createListAvailableDaysTool(log: PocLog) {
  return new FunctionTool({
    name: 'list_available_days',
    description: 'List upcoming available appointment days for a sede.',
    parameters: z.object({
      sede: z.enum(['sucre', 'cochabamba']),
    }),
    execute: async (args, toolContext) => {
      log.event('tool_call', {
        name: 'list_available_days',
        sessionId: toolContext?.sessionId,
        sede: args.sede,
      });
      return {
        sede: args.sede,
        days: DAYS.map((date) => ({ date, label: date })),
      };
    },
  });
}

export function createListAvailableHoursTool(log: PocLog) {
  return new FunctionTool({
    name: 'list_available_hours',
    description: 'List available hours for a sede on a date (YYYY-MM-DD).',
    parameters: z.object({
      sede: z.enum(['sucre', 'cochabamba']),
      date: z.string(),
    }),
    execute: async (args, toolContext) => {
      log.event('tool_call', {
        name: 'list_available_hours',
        sessionId: toolContext?.sessionId,
        sede: args.sede,
        date: args.date,
      });
      const slots = slotsFor(args.sede, args.date);
      return {
        sede: args.sede,
        date: args.date,
        hours: slots.map((slot) => ({
          slot_id: slot.slot_id,
          time: slot.time,
        })),
      };
    },
  });
}

export function createBookAppointmentTool(log: PocLog) {
  return new FunctionTool({
    name: 'book_appointment',
    description: 'Book an appointment with a stable slot_id from list_available_hours.',
    parameters: z.object({
      sede: z.enum(['sucre', 'cochabamba']),
      customer_name: z.string(),
      service_name: z.string(),
      slot_id: z.string(),
    }),
    execute: async (args, toolContext) => {
      log.event('tool_call', {
        name: 'book_appointment',
        sessionId: toolContext?.sessionId,
        slot_id: args.slot_id,
      });
      const parts = args.slot_id.split('_');
      const date = parts[1] ?? DAYS[0];
      const timeRaw = parts[2] ?? '0900';
      const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2)}`;
      const slot: Slot & { customer_name: string; service_name: string } = {
        slot_id: args.slot_id,
        date,
        time,
        sede: args.sede,
        customer_name: args.customer_name,
        service_name: args.service_name,
      };
      bookings.set(args.slot_id, slot);
      if (toolContext?.state) {
        toolContext.state.set('active_sede', args.sede);
        toolContext.state.set('last_booking_id', args.slot_id);
      }
      return {
        status: 'booked',
        slot_id: args.slot_id,
        sede: args.sede,
        date,
        time,
      };
    },
  });
}

/** Test helper */
export function clearFakeBookings(): void {
  bookings.clear();
}
