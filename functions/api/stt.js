export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const formData = await request.formData();
    const audioBlob = formData.get('file');

    if (!audioBlob) {
      return new Response(JSON.stringify({ error: "음성 데이터가 누락되었습니다." }), { status: 400, headers: corsHeaders });
    }

    // Groq 전용 FormData 재구성 (안전하게 다시 쌓기)
    const groqFormData = new FormData();
    groqFormData.append("file", audioBlob, "recording.webm");
    groqFormData.append("model", "whisper-large-v3");
    groqFormData.append("language", "ko");
    groqFormData.append("response_format", "json");

    const groqResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.GROQ_API_KEY}` },
      body: groqFormData
    });

    const data = await groqResponse.json();

    // Groq가 에러를 보냈을 경우
    if (!groqResponse.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "Groq API 통신 실패" }), { 
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
