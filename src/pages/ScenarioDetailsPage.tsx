import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { getScenario } from "../lib/api";
import type { BudgetScenario } from "../types";

export default function ScenarioDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [scenario, setScenario] = useState<BudgetScenario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getScenario(Number(id))
      .then(setScenario)
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="py-12 text-center text-gray-500">Carregando...</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {scenario?.name ?? "Orçamento"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Detalhes em implementação...</p>
        </CardContent>
      </Card>
    </div>
  );
}
