<script>
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let identifier = $state(''); // username or email
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let touched = $state({ identifier: false, password: false });

	const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	const isEmail = $derived(emailRe.test(identifier));

	const validation = $derived({
		identifier:
			touched.identifier && identifier.trim().length === 0 ? 'Enter your username or email' : '',
		password: touched.password && password.length < 1 ? 'Enter your password' : ''
	});

	const canSubmit = $derived(identifier.trim().length > 0 && password.length > 0 && !loading);

	async function handleSubmit() {
		touched = { identifier: true, password: true };
		if (!canSubmit) return;
		loading = true;
		error = '';

		const { error: err } = isEmail
			? await authClient.signIn.email({ email: identifier, password })
			: await authClient.signIn.username({ username: identifier, password });

		loading = false;
		if (err) error = err.message ?? 'Invalid credentials. Please try again.';
		else goto('/dashboard');
	}
</script>

<div class="flex min-h-svh items-center justify-center bg-zinc-950 p-4">
	<!-- subtle grid bg -->
	<div
		class="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:48px_48px]"
	></div>
	<!-- glow -->
	<div
		class="pointer-events-none fixed top-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/10 blur-[100px]"
	></div>

	<div class="relative w-full max-w-sm">
		<div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
			<!-- header -->
			<div class="mb-8 text-center">
				<div
					class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10"
				>
					<span class="text-lg text-violet-400">✦</span>
				</div>
				<h1 class="text-2xl font-semibold tracking-tight text-zinc-50">Welcome back</h1>
				<p class="mt-1 text-sm text-zinc-500">Sign in to your account</p>
			</div>

			{#if error}
				<div
					class="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					{error}
				</div>
			{/if}

			<div class="space-y-4">
				<!-- username or email -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<label
							for="identifier"
							class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
						>
							Username or email
						</label>
						{#if identifier.length > 0}
							<span class="text-xs text-zinc-600 transition-all">
								{isEmail ? '@ email' : '# username'}
							</span>
						{/if}
					</div>
					<input
						id="identifier"
						type="text"
						bind:value={identifier}
						onblur={() => (touched.identifier = true)}
						placeholder="janesmith or jane@example.com"
						autocomplete="username"
						class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
							{validation.identifier
							? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
							: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
					/>
					{#if validation.identifier}
						<p class="text-xs text-red-400">{validation.identifier}</p>
					{/if}
				</div>

				<!-- password -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<label for="password" class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
							>Password</label
						>
						<a
							href="/forgot-password"
							class="text-xs text-zinc-500 transition-colors hover:text-violet-400"
							>Forgot password?</a
						>
					</div>
					<input
						id="password"
						type="password"
						bind:value={password}
						onblur={() => (touched.password = true)}
						placeholder="••••••••"
						autocomplete="current-password"
						class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
							{validation.password
							? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
							: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
					/>
					{#if validation.password}
						<p class="text-xs text-red-400">{validation.password}</p>
					{/if}
				</div>
			</div>

			<button
				onclick={handleSubmit}
				disabled={!canSubmit}
				class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
			>
				{#if loading}
					<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						/>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
						/>
					</svg>
					Signing in…
				{:else}
					Sign in
				{/if}
			</button>

			<p class="mt-5 text-center text-sm text-zinc-500">
				Don't have an account?
				<a
					href="/signup"
					class="font-medium text-violet-400 transition-colors hover:text-violet-300">Sign up</a
				>
			</p>
		</div>
	</div>
</div>
