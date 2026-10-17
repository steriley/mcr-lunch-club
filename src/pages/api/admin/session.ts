export const prerender = false;

export async function GET({ locals }: { locals: App.Locals }) {
  if (!locals.session || !locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  return Response.json({
    user: locals.user,
    session: locals.session,
  });
}
