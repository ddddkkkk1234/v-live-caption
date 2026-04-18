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

    // 1. API 키 확인 (여러 후보 이름 지원)
    const geminiKey = (env.GEMINI_API_KEY || env.Gemini || env.GOOGLE_AI_KEY || "").trim();

    if (!geminiKey) {
      return new Response(JSON.stringify({ 
        error: "Gemini API 키가 설정되지 않았습니다. (Cloudflare 대시보드 -> Settings -> Functions -> Environment variables에서 GEMINI_API_KEY를 추가하고 다시 배포해주세요.)" 
      }), { status: 500, headers: corsHeaders });
    }

    if (!text || text.length < 5) {
      return new Response(JSON.stringify({ result: "분석할 자막 데이터가 충분하지 않습니다." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Gemini API 호출 (1.5 Flash 모델)
    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
    
    const response = await fetch(apiURL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `당신은 실시간 대화 분석 전문가입니다. 다음 자막 내용을 3줄 이내의 불렛 포인트로 요약해주세요. 
            불필요한 추임새는 무시하고 친절한 '~해요' 말투로 작성하세요.
            내용: "${text}"`
          }]
        }]
      })
    });

    const data = await response.json();
    
    // 3. 응답 에러 핸들링 상세화
    if (!response.ok) {
      let errorMsg = data.error?.message || "알 수 없는 API 에러";
      if (response.status === 400) errorMsg = "잘못된 요청입니다. (API 키 혹은 데이터 형식 확인)";
      if (response.status === 403) errorMsg = "API 키 권한이 없거나 차단되었습니다.";
      if (response.status === 429) errorMsg = "API 호출 한도를 초과했습니다.";
      
      return new Response(JSON.stringify({ error: `Gemini 에러 (${response.status}): ${errorMsg}` }), { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // 4. 결과 추출 로직 보강
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      return new Response(JSON.stringify({ error: "AI가 분석 결과를 생성하지 못했습니다. 다시 시도해주세요." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ result: aiResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "서버 연결 오류: " + err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
