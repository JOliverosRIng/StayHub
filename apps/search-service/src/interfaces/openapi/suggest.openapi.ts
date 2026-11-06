import { applyDecorators } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { Problem } from "./search.responses";
import {
  SuggestionItemResponse,
  SuggestionsResponse,
} from "../http/dto/suggestion.response";

export function ApiSuggest(): MethodDecorator {
  return applyDecorators(
    ApiBearerAuth("serviceAuth"),
    ApiExtraModels(Problem, SuggestionItemResponse, SuggestionsResponse),
    ApiOperation({
      operationId: "suggestSearchTerms",
      summary: "Sugerir nombres y ubicaciones indexadas",
      description:
        "Devuelve coincidencias no personalizadas de alojamientos publicados. No usa historial, recomendaciones ni datos del usuario.",
    }),
    ApiResponse({
      status: 200,
      description: "Sugerencias no personalizadas.",
      type: SuggestionsResponse,
    }),
    ...(
      [
        [400, "Solicitud inválida."],
        [401, "Service JWT ausente o inválido."],
        [403, "Scope de servicio insuficiente."],
        [503, "PostgreSQL u otra dependencia autoritativa no disponible."],
      ] as const
    ).map(([status, description]) =>
      ApiResponse({
        status,
        description,
        content: {
          "application/problem+json": {
            schema: { $ref: getSchemaPath(Problem) },
          },
        },
      }),
    ),
  );
}
