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

    if (!geminiKey) return new Response(JSON.stringify({ result: "Gemini API 키가 설정되지 않았습니다." }), { status: 200, headers: corsHeaders });

    const userPrompt = question 
      ? `자막 내용: "${text}"\n질문: "${question}"\n위 자막을 바탕으로 질문에 친절히 답해주세요.`
      : `자막 내용: "${text}"\n위 내용을 3줄로 핵심 요약해주세요.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
    });

    const data = await response.json();
    
    if (data.error) {
      return new Response(JSON.stringify({ result: `AI 에러: ${data.error.message}` }), { headers: corsHeaders });
    }

    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      // 차단 사유 확인 (Safety Filter 등)
      const reason = data.promptFeedback?.blockReason || "결과 없음 (내용 검열 혹은 데이터 부족)";
      return new Response(JSON.stringify({ result: `AI 응답 실패: ${reason}` }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ result: aiText }), { headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ result: "연결 오류: " + err.message }), { headers: corsHeaders });
  }
}
