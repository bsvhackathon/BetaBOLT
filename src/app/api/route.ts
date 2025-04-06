import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET handler for the API root
 * Simple test endpoint to verify API functionality
 */
export async function GET(request: NextRequest) {
  try {
    // Get server time for testing
    const serverTime = new Date().toISOString();
    
    // Return basic API information
    return NextResponse.json({
      success: true,
      message: 'API is running',
      version: '1.0',
      endpoints: [
        '/api/getPKH',
        '/api/processBoltTxs'
      ],
      serverTime
    }, { status: 200 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
}