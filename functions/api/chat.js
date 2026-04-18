export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text } = await request.json();

    // 여러 변수 이름 후보 중 하나라도 있으면 가져옴 (유연한 대응)
    const geminiKey = (env.GEMINI_API_KEY || env.Gemini || env.GOOGLE_AI_KEY || "").trim();

    if (!geminiKey) {
      return new Response(JSON.stringify({ 
        error: "Gemini API 키를 찾을 수 없습니다. Cloudflare 설정에서 GEMINI_API_KEY를 확인해주세요." 
      }), { status: 500, headers: corsHeaders });
    }

    if (!text || text.length < 5) {
      return new Response(JSON.stringify({ result: "데이터가 부족하여 분석을 시작할 수 없습니다." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 최신 v1beta 모델 호출
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `당신은 실시간 대화 분석 전문가입니다. 다음 자막 내용을 3줄 이내로 핵심만 요약해주세요. 
            불필요한 추임새는 무시하고 친절한 말투로 작성하세요.
            내용: "${text}"`
          }]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: `Gemini 에러: ${data.error?.message || response.statusText}` 
      }), { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "AI가 응답을 생성하지 못했습니다. (검열 또는 빈 응답)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ result: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "서버 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
