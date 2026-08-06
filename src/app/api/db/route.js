import { PrismaClient } from '@prisma/client';
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET() {
  try {
    const records = await prisma.store.findMany();
    const data = {};
    for (const record of records) {
      try {
        data[record.key] = JSON.parse(record.value);
      } catch (e) {
        data[record.key] = record.value;
      }
    }
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const data = await req.json();
    for (const [key, value] of Object.entries(data)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await prisma.store.upsert({
        where: { key },
        update: { value: stringValue },
        create: { key, value: stringValue }
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
