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
      return new Response(JSON.stringify({ error: "Gemini API 키 누락" }), { status: 500, headers: corsHeaders });
    }

    const userPrompt = question 
      ? `다음 자막을 바탕으로 질문에 답하세요.\n자막: "${text}"\n질문: "${question}"`
      : `다음 내용을 3줄 요약하세요.\n내용: "${text}"`;

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }] })
    });

    const data = await response.json();
    
    // 핵심: result 키를 확실하게 포함시켜서 응답
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "답변을 생성할 수 없습니다.";

    return new Response(JSON.stringify({ result: aiText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ result: "서버 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
