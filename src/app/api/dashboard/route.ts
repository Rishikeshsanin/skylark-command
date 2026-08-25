import { NextResponse } from 'next/server';
import { fetchBusinessData } from '@/lib/monday';
import { buildDashboard } from '@/lib/analytics';
export const dynamic='force-dynamic';
export async function GET(){const requestId=crypto.randomUUID().slice(0,8);try{const {deals,workOrders}=await fetchBusinessData();return NextResponse.json(buildDashboard(deals,workOrders),{headers:{'Cache-Control':'no-store','X-Request-Id':requestId}})}catch(error){console.error(`[dashboard:${requestId}]`,error instanceof Error?error.message:error);return NextResponse.json({error:'Live business data is temporarily unavailable.',requestId},{status:503})}}
