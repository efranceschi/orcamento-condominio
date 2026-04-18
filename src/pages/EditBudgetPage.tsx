import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function EditBudgetPage() {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edição do Orçamento</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Editor Interativo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Edição interativa em implementação...</p>
        </CardContent>
      </Card>
    </div>
  );
}
