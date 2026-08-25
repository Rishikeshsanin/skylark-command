import { NextRequest, NextResponse } from 'next/server';
import { fetchBusinessData } from '@/lib/monday';
import { buildDashboard } from '@/lib/analytics';
import { answerQuestion } from '@/lib/agent';
export const dynamic='force-dynamic';
const buckets=new Map<string,{count:number;reset:number}>();
function allowed(request:NextRequest){const key=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'anonymous';const now=Date.now();const b=buckets.get(key);if(!b||b.reset<now){buckets.set(key,{count:1,reset:now+60_000});return true}b.count++;return b.count<=20}
export async function POST(request:NextRequest){const requestId=crypto.randomUUID().slice(0,8);if(!allowed(request))return NextResponse.json({error:'Too many requests. Please retry shortly.',requestId},{status:429});try{const body=await request.json() as {message?:unknown};if(typeof body.message!=='string'||!body.message.trim()||body.message.length>700)return NextResponse.json({error:'Please send a question between 1 and 700 characters.',requestId},{status:400});const {deals,workOrders}=await fetchBusinessData();const dashboard=buildDashboard(deals,workOrders);return NextResponse.json({...answerQuestion(body.message,dashboard),generatedAt:dashboard.generatedAt,requestId},{headers:{'Cache-Control':'no-store'}})}catch(error){console.error(`[chat:${requestId}]`,error instanceof Error?error.message:error);return NextResponse.json({error:'I could not retrieve live monday.com data for that question.',requestId},{status:503})}}
