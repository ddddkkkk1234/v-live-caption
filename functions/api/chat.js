export async function onRequestPost(context) {
  const { request, env } = context;

  // 1. 보안 설정: CORS (내 웹사이트에서만 허용)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await request.json();

    if (!text || text.length < 5) {
      return new Response(JSON.stringify({ result: "해석할 내용이 너무 적습니다. 좀 더 대화를 나눠보세요!" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Gemini API 호출 (사용자님이 저장한 GEMINI_API_KEY 사용)
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `당신은 대화 요약 전문가입니다. 다음은 실시간으로 생성된 자막 내용입니다. 
            중복되는 문장이나 불완전한 문장은 무시하고, 전체적인 맥락을 파악하여 
            주요 핵심 내용을 3줄 이내의 불렛 포인트로 요약해주세요. 
            말투는 '~해요' 체로 친절하게 작성해주세요.
            
            내용: "${text}"`
          }]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok || data.error) {
      return new Response(JSON.stringify({ error: data.error?.message || "AI 응답 오류" }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!data.candidates || data.candidates.length === 0) {
      return new Response(JSON.stringify({ error: "요약 결과를 생성하지 못했습니다. (검열 또는 데이터 부족)" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const aiResponse = data.candidates[0].content.parts[0].text;

    return new Response(JSON.stringify({ result: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("AI API Error:", err);
    return new Response(JSON.stringify({ error: "AI 해석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
