import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();

    console.log('Creating subscription products and prices in Stripe...');

    const existingPro = await stripe.products.search({
      query: "name:'CodeLens Pro' AND active:'true'"
    });

    if (existingPro.data.length > 0) {
      console.log('Pro Plan product already exists. Skipping.');
      console.log(`Existing product ID: ${existingPro.data[0].id}`);
    } else {
      const proProduct = await stripe.products.create({
        name: 'CodeLens Pro',
        description: 'Unlimited generations, private repos, priority processing',
        metadata: { plan: 'pro' },
      });
      console.log(`Created product: ${proProduct.name} (${proProduct.id})`);

      const proPrice = await stripe.prices.create({
        product: proProduct.id,
        unit_amount: 1900,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`Created monthly price: $19.00/month (${proPrice.id})`);
    }

    const existingTeam = await stripe.products.search({
      query: "name:'CodeLens Team' AND active:'true'"
    });

    if (existingTeam.data.length > 0) {
      console.log('Team Plan product already exists. Skipping.');
      console.log(`Existing product ID: ${existingTeam.data[0].id}`);
    } else {
      const teamProduct = await stripe.products.create({
        name: 'CodeLens Team',
        description: 'Everything in Pro + organizations, team management, Slack integration, course assignments',
        metadata: { plan: 'team' },
      });
      console.log(`Created product: ${teamProduct.name} (${teamProduct.id})`);

      const teamPrice = await stripe.prices.create({
        product: teamProduct.id,
        unit_amount: 4900,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`Created monthly price: $49.00/month (${teamPrice.id})`);
    }

    console.log('Products and prices created successfully!');
    console.log('Webhooks will sync this data to your database automatically.');

  } catch (error: any) {
    console.error('Error creating products:', error.message);
    process.exit(1);
  }
}

createProducts();
