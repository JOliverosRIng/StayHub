import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { IsString } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureHttp } from '../../src/interfaces/http/configure-http';

class EchoDto {
  @IsString()
  name!: string;
}

@Controller('test')
class TestController {
  @Post('echo')
  echo(@Body() body: EchoDto): EchoDto { return body; }

  @Get('trace')
  trace(): { readonly ok: boolean } { return { ok: true }; }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe('HTTP bootstrap configuration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { bodyParser: false, logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unknown DTO properties as application/problem+json', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/test/echo')
      .send({ name: 'payment', extra: 'forbidden' })
      .expect('Content-Type', /application\/problem\+json/)
      .expect(400);
    const problem = response.body as { readonly errors: readonly { readonly field: string }[] };
    expect(problem.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'extra' })]));
  });

  it('adds a trace id and rejects bodies larger than 8 KB with Problem Details', async () => {
    const server = app.getHttpServer() as Server;
    const trace = await request(server).get('/test/trace').expect(200);
    expect(trace.headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
    expect(trace.headers['cache-control']).toBe('no-store');

    await request(server)
      .post('/test/echo')
      .send({ name: 'x'.repeat(9_000) })
      .expect('Content-Type', /application\/problem\+json/)
      .expect(413);
  });
});
