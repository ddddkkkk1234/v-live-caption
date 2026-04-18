export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, question } = await request.json();

    const geminiKey = (env.GEMINI_API_KEY || env.Gemini || env.GOOGLE_AI_KEY || "").trim();

    if (!geminiKey) {
      return new Response(JSON.stringify({ 
        error: "Gemini API 키가 설정되지 않았습니다." 
      }), { status: 500, headers: corsHeaders });
    }

    // 질문이 있으면 질문에 답하고, 없으면 요약 진행
    const userPrompt = question 
      ? `다음은 실시간 자막 내용입니다:\n"${text}"\n\n이 내용을 바탕으로 다음 질문에 답해주세요: "${question}"`
      : `다음 자막 내용을 3줄 이내로 핵심만 요약해주세요. 불필요한 추임새는 무시하고 친절한 '~해요' 말투로 작성하세요.\n내용: "${text}"`;

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: userPrompt }]
        }]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Gemini 에러: ${data.error?.message || "오류 발생"}` }), { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    return new Response(JSON.stringify({ result: aiResponse || "응답을 생성할 수 없습니다." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "서버 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
