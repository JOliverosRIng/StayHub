import { Body, Controller, Get, HttpCode, Param, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AddPropertyPhotoUseCase } from '@accommodations/application/photos/add-property-photo.use-case';
import { CreatePropertyUseCase } from '@accommodations/application/properties/create-property.use-case';
import { GetPropertyUseCase } from '@accommodations/application/properties/get-property.use-case';
import { ReplacePropertyUseCase } from '@accommodations/application/properties/replace-property.use-case';
import type { Principal } from '@accommodations/domain/properties/property.types';
import { parseUuid } from '@accommodations/domain/shared/uuid';
import { JwtAuthGuard } from '../auth/jwt.strategy';
import { OptionalJwtGuard } from '../auth/optional-jwt.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../guards/roles.decorator';
import { parseCreateProperty } from './create-property.dto';
import { parsePhotoFile } from './photo-upload.dto';
import { PhotoUploadInterceptor } from './photo-upload.interceptor';
import { parseReplaceProperty } from './replace-property.dto';
import { presentPhoto, presentProperty, type PhotoView, type PropertyView } from './property.presenter';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly createProperty: CreatePropertyUseCase,
    private readonly getProperty: GetPropertyUseCase,
    private readonly replaceProperty: ReplacePropertyUseCase,
    private readonly addPropertyPhoto: AddPropertyPhotoUseCase,
  ) {}

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

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth('bearerAuth')
  @ApiSecurity({})
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'getProperty', summary: 'Consultar una propiedad visible' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 503 })
  async get(@CurrentPrincipal() viewer: Principal | undefined, @Param('id') id: string): Promise<PropertyView> {
    const property = await this.getProperty.execute(parseUuid(id, 'id'), viewer);
    return presentProperty(property, viewer);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth('bearerAuth')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'replaceProperty', summary: 'Reemplazar la representación editable completa de una propiedad' })
  @ApiResponse({ status: 200 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 }) @ApiResponse({ status: 503 })
  async replace(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() body: unknown): Promise<PropertyView> {
    const property = await this.replaceProperty.execute(parseUuid(id, 'id'), principal, parseReplaceProperty(body));
    return presentProperty(property, principal);
  }

  @Post(':id/photos')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @UseInterceptors(PhotoUploadInterceptor)
  @ApiBearerAuth('bearerAuth')
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ operationId: 'addPropertyPhoto', summary: 'Agregar una foto a una propiedad' })
  @ApiResponse({ status: 201 }) @ApiResponse({ status: 400 }) @ApiResponse({ status: 401 }) @ApiResponse({ status: 403 }) @ApiResponse({ status: 404 }) @ApiResponse({ status: 409 }) @ApiResponse({ status: 413 }) @ApiResponse({ status: 415 }) @ApiResponse({ status: 503 })
  async addPhoto(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @UploadedFile() file: { buffer?: Uint8Array } | undefined): Promise<PhotoView> {
    const photo = await this.addPropertyPhoto.execute(parseUuid(id, 'id'), principal, parsePhotoFile(file));
    return presentPhoto(photo);
  }
}
