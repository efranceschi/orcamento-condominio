import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function CategoriesPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">Categorias em implementação...</p>
        </CardContent>
      </Card>
    </div>
  );
}
