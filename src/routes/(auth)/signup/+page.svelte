<script>
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';

	let name = $state('');
	let username = $state('');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);
	let touched = $state({ name: false, username: false, email: false, password: false });

	const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	const validation = $derived({
		name: touched.name && name.trim().length < 2 ? 'At least 2 characters required' : '',
		username:
			touched.username && username.length < 3
				? 'At least 3 characters required'
				: touched.username && !/^[a-z0-9_]+$/i.test(username)
					? 'Letters, numbers, and underscores only'
					: '',
		email: touched.email && !emailRe.test(email) ? 'Enter a valid email address' : '',
		password:
			touched.password && password.length < 8
				? 'At least 8 characters required'
				: touched.password && !/[A-Z]/.test(password)
					? 'Include at least one uppercase letter'
					: touched.password && !/[0-9]/.test(password)
						? 'Include at least one number'
						: ''
	});

	const strengthScore = $derived(() => {
		if (!password) return 0;
		let s = 0;
		if (password.length >= 8) s++;
		if (/[A-Z]/.test(password)) s++;
		if (/[0-9]/.test(password)) s++;
		if (/[^A-Za-z0-9]/.test(password)) s++;
		return s;
	});

	const strengthMeta = $derived(
		[
			{ label: '', color: 'bg-zinc-700' },
			{ label: 'Weak', color: 'bg-red-500' },
			{ label: 'Fair', color: 'bg-orange-400' },
			{ label: 'Good', color: 'bg-yellow-400' },
			{ label: 'Strong', color: 'bg-emerald-400' }
		][strengthScore()]
	);

	const canSubmit = $derived(
		name.trim().length >= 2 &&
			username.length >= 3 &&
			/^[a-z0-9_]+$/i.test(username) &&
			emailRe.test(email) &&
			password.length >= 8 &&
			/[A-Z]/.test(password) &&
			/[0-9]/.test(password) &&
			!loading
	);

	async function handleSubmit() {
		touched = { name: true, username: true, email: true, password: true };
		if (!canSubmit) return;
		loading = true;
		error = '';
		const { error: err } = await authClient.signUp.email({ email, password, name, username });
		loading = false;
		if (err) error = err.message ?? 'Signup failed. Please try again.';
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

	<div class="relative w-full max-w-md">
		<div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
			<!-- header -->
			<div class="mb-8 text-center">
				<div
					class="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-500/10"
				>
					<span class="text-lg text-violet-400">✦</span>
				</div>
				<h1 class="text-2xl font-semibold tracking-tight text-zinc-50">Create an account</h1>
				<p class="mt-1 text-sm text-zinc-500">Fill in the details below to get started</p>
			</div>

			{#if error}
				<div
					class="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
				>
					{error}
				</div>
			{/if}

			<div class="space-y-4">
				<!-- name + username row -->
				<div class="grid grid-cols-2 gap-3">
					<div class="space-y-1.5">
						<label for="name" class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
							>Name</label
						>
						<input
							id="name"
							type="text"
							bind:value={name}
							onblur={() => (touched.name = true)}
							placeholder="Jane Smith"
							autocomplete="name"
							class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
								{validation.name
								? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
								: touched.name && name.trim().length >= 2
									? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30'
									: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
						/>
						{#if validation.name}
							<p class="text-xs text-red-400">{validation.name}</p>
						{/if}
					</div>

					<div class="space-y-1.5">
						<label for="username" class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
							>Username</label
						>
						<input
							id="username"
							type="text"
							bind:value={username}
							onblur={() => (touched.username = true)}
							placeholder="janesmith"
							autocomplete="username"
							class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
								{validation.username
								? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
								: touched.username && username.length >= 3 && /^[a-z0-9_]+$/i.test(username)
									? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30'
									: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
						/>
						{#if validation.username}
							<p class="text-xs text-red-400">{validation.username}</p>
						{:else if touched.username && username.length >= 3}
							<p class="text-xs text-emerald-400">Looks good</p>
						{/if}
					</div>
				</div>

				<!-- email -->
				<div class="space-y-1.5">
					<label for="email" class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
						>Email</label
					>
					<input
						id="email"
						type="email"
						bind:value={email}
						onblur={() => (touched.email = true)}
						placeholder="jane@example.com"
						autocomplete="email"
						class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
							{validation.email
							? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
							: touched.email && emailRe.test(email)
								? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30'
								: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
					/>
					{#if validation.email}
						<p class="text-xs text-red-400">{validation.email}</p>
					{/if}
				</div>

				<!-- password -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<label for="password" class="text-xs font-medium tracking-wider text-zinc-400 uppercase"
							>Password</label
						>
						{#if password && touched.password}
							<span
								class="text-xs font-medium"
								style="color: {['', '#ef4444', '#fb923c', '#facc15', '#34d399'][strengthScore()]}"
								>{strengthMeta.label}</span
							>
						{/if}
					</div>
					<input
						id="password"
						type="password"
						bind:value={password}
						onblur={() => (touched.password = true)}
						placeholder="Min. 8 chars with uppercase & number"
						autocomplete="new-password"
						class="w-full rounded-xl border bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 transition-all outline-none focus:ring-1
							{validation.password
							? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
							: touched.password && !validation.password && password
								? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500/30'
								: 'border-zinc-800 focus:border-violet-500/70 focus:ring-violet-500/20'}"
					/>
					<!-- strength bar -->
					{#if password}
						<div class="mt-1 flex gap-1">
							{#each [1, 2, 3, 4] as i}
								<div
									class="h-1 flex-1 rounded-full transition-all duration-300 {strengthScore() >= i
										? strengthMeta.color
										: 'bg-zinc-800'}"
								></div>
							{/each}
						</div>
					{/if}
					{#if validation.password}
						<p class="text-xs text-red-400">{validation.password}</p>
					{/if}
				</div>
			</div>

			<!-- submit -->
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
					Creating account…
				{:else}
					Create account
				{/if}
			</button>

			<p class="mt-5 text-center text-sm text-zinc-500">
				Already have an account?
				<a href="/login" class="font-medium text-violet-400 transition-colors hover:text-violet-300"
					>Sign in</a
				>
			</p>
		</div>
	</div>
</div>
