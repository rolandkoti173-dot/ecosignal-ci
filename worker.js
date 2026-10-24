// Relais EcoSignal CI : garde la clé secrète et appelle l'API Claude
const SYSTEME =
  "Tu es l'assistant d'EcoSignal CI, une carte citoyenne de signalements " +
  "environnement-santé en Côte d'Ivoire. Tu reçois un résumé chiffré des " +
  "signalements affichés. Réponds en français simple, en 8 phrases maximum. " +
  "Appuie-toi uniquement sur ce résumé ; si l'information manque, dis-le. " +
  "Rappelle que ces données sont indicatives et n'établissent aucun lien de " +
  "cause à effet. Ne pose aucun diagnostic médical et ne désigne aucune " +
  "personne. Pour la prévention, propose des gestes concrets (gestion de " +
  "l'eau stagnante, ramassage des déchets, assainissement) et conseille " +
  "de consulter un centre de santé en cas de symptômes.";

export default {
  async fetch(request, env) {
    const origine = env.ORIGINE_AUTORISEE || "*";
    const cors = {
      "Access-Control-Allow-Origin": origine,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    const json = (objet, statut) =>
      new Response(JSON.stringify(objet), {
        status: statut || 200,
        headers: { ...cors, "Content-Type": "application/json" }
      });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") return json({ erreur: "Méthode non autorisée" }, 405);

    const venantDe = request.headers.get("Origin");
    if (origine !== "*" && venantDe !== origine) {
      return json({ erreur: "Origine non autorisée" }, 403);
    }

    let corps;
    try {
      corps = await request.json();
    } catch (e) {
      return json({ erreur: "Requête invalide" }, 400);
    }
    const question = String(corps.question || "").slice(0, 500);
    const resume = String(corps.resume || "").slice(0, 4000);
    if (!question) return json({ erreur: "Question vide" }, 400);

    try {
      const reponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-haiku-5-5",
          max_tokens: 700,
          system: SYSTEME,
          messages: [{
            role: "user",
            content: "Résumé des signalements affichés :\n" + resume +
                     "\n\nDemande : " + question
          }]
        })
      });
      const data = await reponse.json();
      if (!reponse.ok) {
        return json({ erreur: "Le service IA a répondu avec une erreur." }, 502);
      }
      const texte = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");
      return json({ reponse: texte });
    } catch (e) {
      return json({ erreur: "Service IA injoignable." }, 502);
    }
  }
};
