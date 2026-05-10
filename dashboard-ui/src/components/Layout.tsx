import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { LiveBadge } from './LiveBadge';
import { TopSearchBar } from './TopSearchBar';

export function Layout() {
  const location = useLocation();
  const page = getPageMeta(location.pathname);

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {page.parent ? (
                  <>
                    <BreadcrumbItem className="hidden md:block">
                      <BreadcrumbLink asChild>
                        <Link to={page.parent.to}>{page.parent.label}</Link>
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden md:block" />
                  </>
                ) : null}
                <BreadcrumbItem>
                  <BreadcrumbPage>{page.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2 px-4">
            <TopSearchBar />
            <LiveBadge />
          </div>
        </header>

        <div className="flex flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function getPageMeta(pathname: string): {
  title: string;
  description: string;
  parent?: { label: string; to: string };
} {
  if (pathname === '/') {
    return {
      title: 'Overview',
      description: 'Monitor recent activity, ingestion health, and dashboard highlights.',
    };
  }

  if (pathname === '/setup') {
    return {
      title: 'Setup',
      description: 'Configure ingestion, storage paths, and runtime preferences.',
    };
  }

  if (pathname === '/search') {
    return {
      title: 'Search',
      description: 'Explore indexed messages, users, and attachments.',
      parent: { label: 'Overview', to: '/' },
    };
  }

  if (pathname === '/activity') {
    return {
      title: 'Activity',
      description: 'Inspect member, voice, presence, and audit activity.',
      parent: { label: 'Overview', to: '/' },
    };
  }

  if (pathname === '/stats') {
    return {
      title: 'Analytics',
      description: 'Review message trends and the most active channels and users.',
      parent: { label: 'Overview', to: '/' },
    };
  }

  if (pathname === '/settings') {
    return {
      title: 'Settings',
      description: 'Manage dashboard behavior and maintenance tools.',
    };
  }

  if (pathname.startsWith('/guilds/') && pathname.includes('/channels/')) {
    return {
      title: 'Channel Feed',
      description: 'Follow channel activity and recent message capture.',
      parent: { label: 'Guild', to: pathname.replace(/\/channels\/.*$/, '') },
    };
  }

  if (pathname.startsWith('/guilds/')) {
    return {
      title: 'Guild Workspace',
      description: 'Browse guild-specific channels, stats, and activity.',
      parent: { label: 'Overview', to: '/' },
    };
  }

  if (pathname.startsWith('/messages/')) {
    return {
      title: 'Message Detail',
      description: 'Inspect metadata, edits, and related author information.',
       parent: { label: 'Results', to: '/search' },
    };
  }

  if (pathname.startsWith('/users/')) {
    return {
      title: 'User Profile',
      description: 'View message history and activity for a tracked user.',
       parent: { label: 'Results', to: '/search' },
    };
  }

  return {
    title: 'Dashboard',
    description: 'Navigate the Discord logger workspace.',
  };
}
