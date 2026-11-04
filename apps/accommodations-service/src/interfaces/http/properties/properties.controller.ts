import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreatePropertyUseCase } from '@accommodations/application/properties/create-property.use-case';
import type { Principal } from '@accommodations/domain/properties/property.types';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { parseCreateProperty } from './create-property.dto';
import { presentProperty, type PropertyView } from './property.presenter';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly createProperty: CreatePropertyUseCase) {}

  @Post()
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ operationId: 'createProperty', summary: 'Crear una propiedad en borrador' })
  @ApiResponse({ status: 201 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 503 })
  async create(@CurrentPrincipal() principal: Principal, @Body() body: unknown): Promise<PropertyView> {
    const property = await this.createProperty.execute(principal, parseCreateProperty(body));
    return presentProperty(property, principal);
  }
}
