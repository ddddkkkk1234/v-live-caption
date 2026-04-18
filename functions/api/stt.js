export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // [유연한 대응] 여러 이름 후보 중 하나라도 있으면 가져옴
    const groqKey = (env.GROQ_API_KEY || env["Groq Console Keys"] || "").trim();

    if (!groqKey) {
      const availableKeys = Object.keys(env).join(", ");
      return new Response(JSON.stringify({ 
        error: "API 키를 찾을 수 없습니다.",
        debug: `인식된 이름들: [${availableKeys || "없음"}]. 이름을 'GROQ_API_KEY'로 맞춰주세요.`
      }), { status: 500, headers: corsHeaders });
    }

    const formData = await request.formData();
    const audioBlob = formData.get('file');

    if (!audioBlob) {
      return new Response(JSON.stringify({ error: "데이터 누락" }), { status: 400, headers: corsHeaders });
    }

    // Groq Whisper 호출
    const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${groqKey}` },
      body: formData
    });

    const data = await groqResponse.json();

    if (!groqResponse.ok) {
      return new Response(JSON.stringify({ error: `Groq 에러: ${data.error?.message}` }), { 
        status: groqResponse.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    return new Response(JSON.stringify({ text: data.text || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "서버 내부 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
