import { ApiProperty } from "@nestjs/swagger";
import type {
  SuggestionItem,
  SuggestionType,
} from "@search/domain/suggestion";

export class SuggestionItemResponse implements SuggestionItem {
  @ApiProperty() public text!: string;
  @ApiProperty({ enum: ["PROPERTY", "LOCATION"] })
  public type!: SuggestionType;
}

export class SuggestionsResponse {
  @ApiProperty({ type: [SuggestionItemResponse] })
  public items!: SuggestionItemResponse[];
}
