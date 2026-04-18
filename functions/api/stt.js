export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const key = env.GROQ_API_KEY ? env.GROQ_API_KEY.trim() : "";
    
    // 1. 키 상태 진단 (로그용)
    if (!key) {
      return new Response(JSON.stringify({ error: "API 키가 등록되지 않았습니다 (Variable name: GROQ_API_KEY)" }), { status: 500, headers: corsHeaders });
    }

    const keyPrefix = key.substring(0, 4); // 키 앞부분만 추출 (진단용)

    const formData = await request.formData();
    const audioBlob = formData.get('file');

    if (!audioBlob) {
      return new Response(JSON.stringify({ error: "음성 데이터가 없습니다." }), { status: 400, headers: corsHeaders });
    }

    // Groq Whisper 호출
    const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}` },
      body: formData
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      // 에러 메시지에 사용 중인 키의 앞부분을 포함시켜 진단 지원
      return new Response(JSON.stringify({ 
        error: `Groq 에러: ${data.error?.message || "알 수 없는 에러"} (사용 중인 키 시작: ${keyPrefix}...)` 
      }), { 
        status: groqResponse.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(JSON.stringify({ text: data.text || "", debug: `Key used: ${keyPrefix}...` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "서버 내부 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
