import { Body, Controller, Get, Post, Param, HttpCode, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreatePendingUser } from '@users/application/registration/create-pending-user.use-case';
import { ActivatePendingUser } from '@users/application/registration/activate-pending-user.use-case';
import { CancelPendingUser } from '@users/application/registration/cancel-pending-user.use-case';
import { GetRegistration } from '@users/application/registration/get-registration.use-case';
import type { UserSummary } from '@users/application/ports/user.repository';
import { ServiceAuthGuard, ServiceScope } from '../guards/service-auth.guard';
import { PendingUserDto, emptyCommand } from './registration.dto';
import { RegistrationCreateApi, RegistrationGetApi, RegistrationTransitionApi } from '../../openapi/registration.openapi';
@Controller('internal/v1/registrations') @UseGuards(ServiceAuthGuard) @ServiceScope('registration') @ApiBearerAuth('serviceAuth')
export class RegistrationController {
  constructor(private readonly createUser: CreatePendingUser, private readonly activateUser: ActivatePendingUser, private readonly cancelUser: CancelPendingUser, private readonly getRegistration: GetRegistration) {}
  @Post() @RegistrationCreateApi()
  create(@Body() body: PendingUserDto): Promise<UserSummary> { return this.createUser.execute(body); }
  @Get(':registrationId') @RegistrationGetApi()
  get(@Param('registrationId') id: string): Promise<UserSummary> { return this.getRegistration.execute(id); }
  @Post(':registrationId/activate') @HttpCode(200) @RegistrationTransitionApi(true)
  activate(@Param('registrationId') id: string, @Body() body: unknown): Promise<UserSummary> { emptyCommand(body); return this.activateUser.execute(id); }
  @Post(':registrationId/cancel') @HttpCode(204) @RegistrationTransitionApi(false)
  cancel(@Param('registrationId') id: string, @Body() body: unknown): Promise<void> { emptyCommand(body); return this.cancelUser.execute(id); }
}
