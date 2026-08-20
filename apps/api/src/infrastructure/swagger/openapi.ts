export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CampusAR API',
    version: '1.0.0',
    description: 'Intelligent AR campus navigation REST API',
  },
  servers: [{ url: '/api' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        summary: 'Student/admin login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Auth response' } },
      },
    },
    '/auth/guest': {
      post: {
        summary: 'Guest mode session',
        responses: { '201': { description: 'Guest auth response' } },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register student account',
        responses: { '201': { description: 'Created' } },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Refresh tokens',
        responses: { '200': { description: 'Auth response' } },
      },
    },
    '/campus/buildings': {
      get: { summary: 'List buildings', responses: { '200': { description: 'OK' } } },
    },
    '/campus/search': {
      get: {
        summary: 'Search buildings and rooms',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/navigation/route': {
      post: {
        summary: 'Compute A* smart route',
        responses: { '200': { description: 'Route' }, '404': { description: 'No route' } },
      },
    },
    '/indoor/route': {
      post: {
        summary: 'Indoor A* route after QR relocalization',
        responses: { '200': { description: 'Indoor route' }, '422': { description: 'No route' } },
      },
    },
    '/safety/zones': {
      get: { summary: 'List danger zones', responses: { '200': { description: 'OK' } } },
    },
    '/safety/sos': {
      post: { summary: 'Trigger SOS', responses: { '201': { description: 'Created' } } },
    },
    '/notifications': {
      get: { summary: 'List notifications', responses: { '200': { description: 'OK' } } },
    },
    '/admin/weights': {
      get: {
        summary: 'Get route weights',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
      put: {
        summary: 'Update route weights',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/analytics/summary': {
      get: {
        summary: 'Analytics summary',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};
