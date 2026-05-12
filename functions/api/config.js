export async function onRequestGet(context) {
  const { env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  // Cloudflare 대시보드에 등록된 환경 변수를 읽어옵니다.
  return new Response(JSON.stringify({
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseKey: env.SUPABASE_KEY || ""
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
